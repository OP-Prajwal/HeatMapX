import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import cv2
import numpy as np
import base64
import ee
from datetime import date, timedelta

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
try:
    from tensorflow.keras.models import load_model
except Exception as e:
    load_model = None
    print(f"[WARN] TensorFlow not available, land-cover U-Net disabled: {e}")

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Enable CORS for the React frontend
CORS(app)

API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')
GEE_PROJECT = os.getenv('GEE_PROJECT', 'heatmap-494308')
LANDCOVER_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'landcover_unet_model.h5')
SATELLITE_IMAGE_TIMEOUT_SECONDS = 20
S2_BASE_BANDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12']
S2_DERIVED_BANDS = ['NDVI', 'NDBI', 'NDWI', 'SAVI']
LANDCOVER_CLASSES = {
    0: 'barren',
    1: 'built_up',
    2: 'crop',
    3: 'forest',
    4: 'water',
}


try:
    if load_model is not None and os.path.exists(LANDCOVER_MODEL_PATH):
        landcover_model = load_model(LANDCOVER_MODEL_PATH, compile=False)
        LANDCOVER_MODEL_AVAILABLE = True
        print(f"[OK] Land-cover U-Net loaded from {LANDCOVER_MODEL_PATH}")
    else:
        landcover_model = None
        LANDCOVER_MODEL_AVAILABLE = False
        print(f"[WARN] Land-cover model not found at {LANDCOVER_MODEL_PATH}")
except Exception as e:
    landcover_model = None
    LANDCOVER_MODEL_AVAILABLE = False
    print(f"[WARN] Failed to load land-cover U-Net: {e}")


def get_satellite_date_range(years_back=3):
    """Use a rolling window so GEE queries do not go stale."""
    end = date.today()
    start = end - timedelta(days=365 * years_back)
    return start.isoformat(), end.isoformat()


def build_gee_geometry(lat, lng, bounds=None):
    if bounds:
        return ee.Geometry.Rectangle([
            bounds['minLng'], bounds['minLat'],
            bounds['maxLng'], bounds['maxLat']
        ])
    
    # Use exact same bounding box as ArcGIS to ensure ML model masks perfectly align
    d = 0.001
    return ee.Geometry.Rectangle([
        lng - d, lat - d,
        lng + d, lat + d
    ])


def parse_float_field(value, field_name):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name} provided.")


def parse_bounds(min_lat, max_lat, min_lng, max_lng):
    supplied = [min_lat, max_lat, min_lng, max_lng]
    if not any(supplied):
        return None
    if not all(supplied):
        raise ValueError("Custom bounds must include minLat, maxLat, minLng, and maxLng.")

    bounds = {
        'minLat': parse_float_field(min_lat, 'minLat'),
        'maxLat': parse_float_field(max_lat, 'maxLat'),
        'minLng': parse_float_field(min_lng, 'minLng'),
        'maxLng': parse_float_field(max_lng, 'maxLng'),
    }

    if bounds['minLat'] >= bounds['maxLat'] or bounds['minLng'] >= bounds['maxLng']:
        raise ValueError("Custom bounds are invalid.")
    if not (-90 <= bounds['minLat'] <= 90 and -90 <= bounds['maxLat'] <= 90):
        raise ValueError("Latitude bounds must be between -90 and 90.")
    if not (-180 <= bounds['minLng'] <= 180 and -180 <= bounds['maxLng'] <= 180):
        raise ValueError("Longitude bounds must be between -180 and 180.")

    return bounds


def classify_heat_risk(heat_percent):
    if heat_percent > 70:
        return "High Urban Heat Island Risk", "high"
    if heat_percent > 40:
        return "Moderate Heat Risk", "moderate"
    return "Safe Area / Low Heat", "safe"


def estimate_surface_temperature(built_up_percent):
    return round(25.0 + (built_up_percent / 100.0) * 20.0, 1)


def backend_capabilities():
    return {
        "geeAvailable": GEE_AVAILABLE,
        "geeProject": GEE_PROJECT,
        "landcoverModelAvailable": LANDCOVER_MODEL_AVAILABLE,
        "landcoverModelPath": LANDCOVER_MODEL_PATH if LANDCOVER_MODEL_AVAILABLE else None,
    }


# Initialize Google Earth Engine
try:
    ee.Initialize(project=GEE_PROJECT)
    GEE_AVAILABLE = True
    print(f"[OK] Google Earth Engine initialized successfully (project: {GEE_PROJECT})")
except Exception as e:
    GEE_AVAILABLE = False
    print(f"[WARN] GEE not available, falling back to OpenCV-only mode: {e}")


# ===============================================================
# GOOGLE EARTH ENGINE — REAL SATELLITE DATA FUNCTIONS
# ===============================================================

def get_lst_from_gee(lat, lng, bounds=None):
    """
    Get real Land Surface Temperature from Landsat 8/9 thermal bands.
    Returns temperature in Celsius.
    """
    try:
        geometry = build_gee_geometry(lat, lng, bounds)

        start_date, end_date = get_satellite_date_range()

        # Query Landsat 8/9 Level-2 (atmospherically corrected, includes Surface Temp)
        # using a rolling recent window for best coverage.
        collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 30)) \
            .sort('CLOUD_COVER')

        landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 30))

        collection = collection.merge(landsat9).sort('CLOUD_COVER')
        count = collection.size().getInfo()

        if count == 0:
            return None

        # Use median composite for stability (reduces cloud artifacts)
        image = collection.median()

        # ST_B10 is surface temperature band
        # Scale factor: DN * 0.00341802 + 149.0 → Kelvin → subtract 273.15 → Celsius
        lst = image.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15)

        result = lst.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geometry,
            scale=30,
            maxPixels=1e8
        ).getInfo()

        temp_c = result.get('ST_B10')
        if temp_c is not None:
            return round(temp_c, 2)
        return None

    except Exception as e:
        print(f"GEE LST Error: {e}")
        return None


def get_ndvi_from_gee(lat, lng, bounds=None):
    """
    Get real spectral indices and area-cover estimates from Sentinel-2.

    NDVI/NDBI/NDWI are mean index values. The *_cover fields are pixel
    percentages based on index thresholds across the selected geometry.
    """
    try:
        geometry = build_gee_geometry(lat, lng, bounds)

        start_date, end_date = get_satellite_date_range()

        # Sentinel-2 Surface Reflectance (10m resolution, 13 bands)
        collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)) \
            .sort('CLOUDY_PIXEL_PERCENTAGE')

        count = collection.size().getInfo()
        if count == 0:
            return None

        image = collection.median()

        # NDVI = (NIR - Red) / (NIR + Red) = (B8 - B4) / (B8 + B4)
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')

        # Also compute NDBI (built-up index) = (SWIR - NIR) / (SWIR + NIR) = (B11 - B8) / (B11 + B8)
        ndbi = image.normalizedDifference(['B11', 'B8']).rename('NDBI')

        # And NDWI (water index) = (Green - NIR) / (Green + NIR) = (B3 - B8) / (B3 + B8)
        ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')

        vegetation_mask = ndvi.gt(0.25).rename('vegetation_cover')
        dense_vegetation_mask = ndvi.gt(0.45).rename('dense_vegetation_cover')
        water_mask = ndwi.gt(0).rename('water_cover')
        built_up_mask = ndbi.gt(0).And(ndvi.lt(0.3)).And(ndwi.lt(0)).rename('built_up_cover')

        combined = ndvi.addBands(ndbi).addBands(ndwi) \
            .addBands(vegetation_mask) \
            .addBands(dense_vegetation_mask) \
            .addBands(water_mask) \
            .addBands(built_up_mask)

        result = combined.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geometry,
            scale=10,
            maxPixels=1e8
        ).getInfo()

        return {
            'ndvi': round(result.get('NDVI', 0), 4),
            'ndbi': round(result.get('NDBI', 0), 4),
            'ndwi': round(result.get('NDWI', 0), 4),
            'vegetation_cover': round(result.get('vegetation_cover', 0) * 100, 2),
            'dense_vegetation_cover': round(result.get('dense_vegetation_cover', 0) * 100, 2),
            'water_cover': round(result.get('water_cover', 0) * 100, 2),
            'built_up_cover': round(result.get('built_up_cover', 0) * 100, 2),
        }

    except Exception as e:
        print(f"GEE NDVI Error: {e}")
        return None


def get_landcover_stack_from_gee(lat, lng, bounds=None):
    """
    Build a 64x64x16 Sentinel-2 feature stack for the optional land-cover U-Net.

    Channels:
    12 Sentinel-2 surface reflectance bands + NDVI + NDBI + NDWI + SAVI.
    """
    if not GEE_AVAILABLE:
        return None

    try:
        geometry = build_gee_geometry(lat, lng, bounds)
        start_date, end_date = get_satellite_date_range()

        collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)) \
            .sort('CLOUDY_PIXEL_PERCENTAGE')

        if collection.size().getInfo() == 0:
            return None

        image = collection.median()
        base = image.select(S2_BASE_BANDS)

        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndbi = image.normalizedDifference(['B11', 'B8']).rename('NDBI')
        ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')
        savi = image.expression(
            '((nir - red) / (nir + red + 0.5)) * 1.5',
            {'nir': image.select('B8'), 'red': image.select('B4')}
        ).rename('SAVI')

        feature_image = base.addBands([ndvi, ndbi, ndwi, savi])
        band_names = S2_BASE_BANDS + S2_DERIVED_BANDS

        rectangle = feature_image.sampleRectangle(
            region=geometry,
            defaultValue=0,
            properties=[]
        ).getInfo()

        properties = rectangle.get('properties', {})
        channels = []
        for band in band_names:
            band_array = np.array(properties.get(band), dtype=np.float32)
            if band_array.ndim != 2 or band_array.size == 0:
                return None

            band_array = cv2.resize(band_array, (64, 64), interpolation=cv2.INTER_AREA)

            if band in S2_BASE_BANDS:
                band_array = np.clip(band_array / 10000.0, 0.0, 1.0)
            else:
                band_array = np.clip((band_array + 1.0) / 2.0, 0.0, 1.0)

            channels.append(band_array)

        stack = np.stack(channels, axis=-1).astype(np.float32)
        if stack.shape != (64, 64, 16):
            return None
        return stack

    except Exception as e:
        print(f"GEE land-cover stack error: {e}")
        return None


def predict_landcover_from_stack(stack):
    """
    Run the optional U-Net and return class percentages.
    """
    if not LANDCOVER_MODEL_AVAILABLE or stack is None:
        return None

    try:
        prediction = landcover_model.predict(np.expand_dims(stack, axis=0), verbose=0)[0]
        class_mask = np.argmax(prediction, axis=-1)
        total_pixels = class_mask.size

        percentages = {}
        for class_id, class_name in LANDCOVER_CLASSES.items():
            percentages[class_name] = round(float(np.count_nonzero(class_mask == class_id) / total_pixels * 100.0), 2)

        green_cover = round(percentages['crop'] + percentages['forest'], 2)
        water_cover = percentages['water']
        built_up = percentages['built_up']

        # Generate 64x64 binary masks from classes and upscale to match 600x600 imagery
        green_mask_64 = np.logical_or(class_mask == 2, class_mask == 3).astype(np.uint8) * 255
        water_mask_64 = (class_mask == 4).astype(np.uint8) * 255

        green_mask = cv2.resize(green_mask_64, (600, 600), interpolation=cv2.INTER_NEAREST)
        water_mask = cv2.resize(water_mask_64, (600, 600), interpolation=cv2.INTER_NEAREST)

        return {
            'green_cover': green_cover,
            'water_cover': water_cover,
            'built_up': built_up,
            'barren': percentages['barren'],
            'crop': percentages['crop'],
            'forest': percentages['forest'],
            'class_percentages': percentages,
            'model_name': 'bhargav37/lulc-dl-model landcover_unet_model.h5',
            'green_mask': green_mask,
            'water_mask': water_mask,
        }

    except Exception as e:
        print(f"Land-cover U-Net prediction error: {e}")
        return None


def validate_landcover_result(landcover_result, indices):
    if not landcover_result or not indices:
        return None, "not_available"

    green_from_indices = indices.get('vegetation_cover', round(max(0, indices.get('ndvi', 0)) * 100, 2))
    water_from_indices = indices.get('water_cover', round(max(0, indices.get('ndwi', 0)) * 100, 2))
    green_delta = abs(landcover_result['green_cover'] - green_from_indices)
    water_delta = abs(landcover_result['water_cover'] - water_from_indices)

    if landcover_result['green_cover'] >= 95 and indices.get('ndvi', 0) < 0.5:
        return None, "rejected_green_cover_conflicts_with_ndvi"
    if landcover_result['water_cover'] >= 20 and indices.get('ndwi', 0) <= 0:
        return None, "rejected_water_cover_conflicts_with_ndwi"
    if green_delta > 45 or water_delta > 30:
        return None, "rejected_spectral_index_mismatch"

    return landcover_result, "used"


def calculate_gee_uhi_risk(lst_celsius, indices):
    """
    Calculate UHI risk using real satellite data.
    Uses LST + NDVI + NDBI for a scientifically grounded assessment.
    """
    if lst_celsius is None or indices is None:
        return None

    ndvi = indices.get('ndvi', 0)
    ndbi = indices.get('ndbi', 0)
    ndwi = indices.get('ndwi', 0)

    # --- Scientific UHI Risk Model ---
    # Base risk from absolute temperature (reference: 25°C is neutral)
    temp_risk = max(0, min(100, (lst_celsius - 20) * 3.5))

    # Built-up amplification: high NDBI = more concrete = more heat
    buildup_factor = max(0, ndbi) * 40

    # Vegetation cooling: high NDVI = trees = cooling
    green_cooling = max(0, ndvi) * 35

    # Water cooling: positive NDWI = water present = cooling
    water_cooling = max(0, ndwi) * 20

    # Combined risk
    risk = temp_risk + buildup_factor - green_cooling - water_cooling
    risk = max(0.0, min(100.0, risk))

    return round(risk, 2)


# ===============================================================
# OPENCV IMAGE ANALYSIS PIPELINE (Fallback for image uploads)
# ===============================================================

def _detect_overlay_mask(img):
    """
    Detect rendered map overlays (text labels, road lines, markers, UI
    elements) that are commonly present in Google Maps / Apple Maps
    screenshots.  Returns a binary mask where 255 = overlay pixel to
    exclude from vegetation analysis.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # 1. Near-white pixels (text labels, road fills)
    white_mask = gray > 230

    # 2. Near-black text outlines / shadows on labels
    black_mask = gray < 25

    # 3. Strong edge density → rendered vector graphics (roads, borders)
    edges = cv2.Canny(img, 80, 200)
    edge_dilated = cv2.dilate(edges, np.ones((7, 7), np.uint8), iterations=1)

    # 4. Very high local contrast (text rendering has sharp edges vs. soft
    #    satellite textures).  Use a local-std filter on small blocks.
    blur = cv2.GaussianBlur(gray.astype(np.float32), (5, 5), 0)
    local_var = cv2.GaussianBlur((gray.astype(np.float32) - blur) ** 2, (15, 15), 0)
    high_contrast = local_var > 1200  # text edges produce very high variance

    # Combine heuristics
    overlay = (white_mask | black_mask | high_contrast).astype(np.uint8) * 255

    # Dilate to cover the fringe pixels around labels
    overlay = cv2.dilate(overlay, np.ones((5, 5), np.uint8), iterations=2)

    return overlay


def analyze_image_opencv(img):
    """
    Analyze an image using the OpenCV vegetation filter.
    Used for uploaded images where no coordinates are available.

    Handles both raw satellite tiles and Google Maps / screenshot uploads
    by first masking rendered overlays and using adaptive gate thresholds.
    """
    total_pixels = img.shape[0] * img.shape[1]

    # ---------------------------------------------------------------
    # STEP 0 — Detect & mask rendered map overlays (text, roads, icons)
    # ---------------------------------------------------------------
    overlay_mask = _detect_overlay_mask(img)
    overlay_ratio = cv2.countNonZero(overlay_mask) / total_pixels
    has_overlays = overlay_ratio > 0.05  # >5% overlay → likely a screenshot

    if has_overlays:
        print(f"[CV] Detected map overlays covering {overlay_ratio*100:.1f}% of image — masking before analysis")

    # ---------------------------------------------------------------
    # GREEN COVER DETECTION (Adaptive 4-Gate Vegetation Filter)
    # ---------------------------------------------------------------
    # Uses Excess Green Index (ExG), Green Chromatic Coordinate (GCC),
    # absolute green-channel dominance, and HSV hue confirmation.
    #
    # Two threshold tiers:
    #   • Standard: tuned for raw satellite tiles (ArcGIS, Sentinel)
    #   • Relaxed:  tuned for Google Maps screenshots with color grading
    # When overlays are detected, we use the relaxed tier directly.
    # Otherwise, we try standard first and fall back to relaxed if
    # the result is suspiciously low (<3%).
    # ---------------------------------------------------------------
    img_f = img.astype(np.float32)
    b_ch, g_ch, r_ch = cv2.split(img_f)
    channel_sum = r_ch + g_ch + b_ch + 1e-6  # avoid div-by-zero

    rn, gn, bn = r_ch / channel_sum, g_ch / channel_sum, b_ch / channel_sum
    exg = 2.0 * gn - rn - bn
    gcc = g_ch / channel_sum

    hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def run_gates(exg_t, gcc_t, dom_t, hsv_lo, hsv_hi):
        """Run the 4-gate filter with given thresholds, return cleaned mask."""
        g1 = exg > exg_t
        g2 = gcc > gcc_t
        g3 = (g_ch > (r_ch + dom_t)) & (g_ch > (b_ch + dom_t))
        g4 = cv2.inRange(hsv_img, np.array(hsv_lo), np.array(hsv_hi)) > 0

        # All-4-gate mask
        m = (g1 & g2 & g3 & g4).astype(np.uint8) * 255

        # Exclude overlay pixels
        if has_overlays:
            m = cv2.bitwise_and(m, cv2.bitwise_not(overlay_mask))

        # Morphological cleanup
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel)
        return m

    # --- Standard thresholds (raw satellite tiles) ---
    mask_std = run_gates(
        exg_t=0.10, gcc_t=0.38, dom_t=8,
        hsv_lo=[28, 40, 15], hsv_hi=[85, 255, 245]
    )
    green_std = cv2.countNonZero(mask_std) / total_pixels * 100

    # --- Relaxed thresholds (Google Maps / color-graded images) ---
    # Lower ExG, GCC, and dominance margins to capture darker/shifted greens
    mask_relaxed = run_gates(
        exg_t=0.06, gcc_t=0.34, dom_t=3,
        hsv_lo=[25, 25, 10], hsv_hi=[90, 255, 250]
    )
    green_relaxed = cv2.countNonZero(mask_relaxed) / total_pixels * 100

    # --- Adaptive selection ---
    if has_overlays or green_std < 3.0:
        # Screenshot detected or standard gates gave suspiciously low result
        mask = mask_relaxed
        green_cover_percent = round(green_relaxed, 2)
        if green_std < 3.0 and not has_overlays:
            print(f"[CV] Standard gates gave {green_std:.1f}% — falling back to relaxed ({green_relaxed:.1f}%)")
    else:
        mask = mask_std
        green_cover_percent = round(green_std, 2)

    # ---------------------------------------------------------------
    # WATER BODY DETECTION (HSV blue/cyan range)
    # ---------------------------------------------------------------
    lower_water = np.array([85, 30, 20])
    upper_water = np.array([140, 255, 255])
    water_mask = cv2.inRange(hsv_img, lower_water, upper_water)

    # Exclude overlays from water detection too
    if has_overlays:
        water_mask = cv2.bitwise_and(water_mask, cv2.bitwise_not(overlay_mask))

    # Cleanup water mask
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_CLOSE, kernel)
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_OPEN, kernel)

    water_ratio = cv2.countNonZero(water_mask) / total_pixels
    water_cover_percent = round(water_ratio * 100, 2)

    # ---------------------------------------------------------
    # UHI RISK CALCULATION (OpenCV fallback)
    # ---------------------------------------------------------
    built_up_percent = max(0.0, 100.0 - (green_cover_percent + water_cover_percent))
    base_thermal_load = built_up_percent * 1.15
    cooling_effect = (green_cover_percent * 0.6) + (water_cover_percent * 0.4)
    calculated_risk = base_thermal_load - cooling_effect
    heat_percent = round(max(0.0, min(100.0, calculated_risk)), 2)

    return {
        'green_cover': green_cover_percent,
        'water_cover': water_cover_percent,
        'built_up': built_up_percent,
        'heat_risk': heat_percent,
        'green_mask': mask,
        'water_mask': water_mask,
    }


def generate_heatmap_overlay(img, green_mask, water_mask):
    """Generate a visual thermal heatmap overlay on the satellite image."""
    # Non-green, non-water areas (concrete, roads) absorb heat
    concrete_mask = cv2.bitwise_not(green_mask)
    concrete_mask = cv2.bitwise_and(concrete_mask, cv2.bitwise_not(water_mask))

    # Apply Gaussian blur to simulate thermal radiation spreading
    thermal_spread = cv2.GaussianBlur(concrete_mask, (101, 101), 0)

    # Apply color mapping (Inferno: Dark=Cool, Yellow/White=Hot)
    heatmap_color = cv2.applyColorMap(thermal_spread, cv2.COLORMAP_INFERNO)

    # Blend thermal layer over original satellite imagery (40% overlay)
    blended_image = cv2.addWeighted(heatmap_color, 0.4, img, 0.6, 0)

    # Encode as base64 jpeg
    _, buffer = cv2.imencode('.jpg', blended_image)
    return base64.b64encode(buffer).decode('utf-8')


# ===============================================================
# API ENDPOINT
# ===============================================================


def get_yearly_snapshot(lat, lng, year, bounds=None):
    """
    Query GEE for a single calendar year and return
    LST + spectral indices + computed UHI risk.
    Returns None if no imagery is found for that year.
    """
    try:
        geometry = build_gee_geometry(lat, lng, bounds)
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"

        # ---- Land Surface Temperature (Landsat 8/9) ----
        l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 30))
        l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 30))
        ls_col = l8.merge(l9)

        lst_celsius = None
        if ls_col.size().getInfo() > 0:
            lst_img = ls_col.median().select('ST_B10') \
                .multiply(0.00341802).add(149.0).subtract(273.15)
            lst_result = lst_img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=30,
                maxPixels=1e8
            ).getInfo()
            val = lst_result.get('ST_B10')
            if val is not None:
                lst_celsius = round(val, 2)

        # ---- Spectral Indices (Sentinel-2) ----
        s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))

        indices = None
        if s2_col.size().getInfo() > 0:
            img = s2_col.median()
            ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
            ndbi = img.normalizedDifference(['B11', 'B8']).rename('NDBI')
            ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI')
            veg_mask = ndvi.gt(0.25).rename('vegetation_cover')
            water_mask = ndwi.gt(0).rename('water_cover')
            built_mask = ndbi.gt(0).And(ndvi.lt(0.3)).And(ndwi.lt(0)).rename('built_up_cover')
            combined = ndvi.addBands(ndbi).addBands(ndwi) \
                .addBands(veg_mask).addBands(water_mask).addBands(built_mask)
            result = combined.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=10,
                maxPixels=1e8
            ).getInfo()
            indices = {
                'ndvi': round(result.get('NDVI', 0), 4),
                'ndbi': round(result.get('NDBI', 0), 4),
                'ndwi': round(result.get('NDWI', 0), 4),
                'vegetation_cover': round((result.get('vegetation_cover') or 0) * 100, 2),
                'water_cover': round((result.get('water_cover') or 0) * 100, 2),
                'built_up_cover': round((result.get('built_up_cover') or 0) * 100, 2),
            }

        if lst_celsius is None and indices is None:
            return None

        heat_risk = calculate_gee_uhi_risk(lst_celsius, indices) if lst_celsius and indices else None

        return {
            'year': year,
            'lst': lst_celsius,
            'ndvi': indices['ndvi'] if indices else None,
            'ndbi': indices['ndbi'] if indices else None,
            'ndwi': indices['ndwi'] if indices else None,
            'greenCover': indices['vegetation_cover'] if indices else None,
            'waterCover': indices['water_cover'] if indices else None,
            'builtUpCover': indices['built_up_cover'] if indices else None,
            'heatRisk': heat_risk,
        }

    except Exception as e:
        print(f"[Temporal] Error for year {year}: {e}")
        return None


@app.route('/api/temporal', methods=['POST'])
def temporal():
    """
    Temporal analysis endpoint.
    Accepts lat/lng (and optional bounds) and returns a year-by-year
    time series of GEE-derived UHI metrics.
    """
    if not GEE_AVAILABLE:
        return jsonify({"error": "Google Earth Engine is not available on this server."}), 503

    lat = request.form.get('lat')
    lng = request.form.get('lng')
    min_lat = request.form.get('minLat')
    max_lat = request.form.get('maxLat')
    min_lng = request.form.get('minLng')
    max_lng = request.form.get('maxLng')

    if not lat or not lng:
        return jsonify({"error": "lat and lng are required."}), 400

    try:
        f_lat = parse_float_field(lat, 'lat')
        f_lng = parse_float_field(lng, 'lng')
        bounds = parse_bounds(min_lat, max_lat, min_lng, max_lng)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    years = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
    series = []
    print(f"[Temporal] Running temporal analysis for ({f_lat}, {f_lng}) over years {years}")

    for year in years:
        snapshot = get_yearly_snapshot(f_lat, f_lng, year, bounds)
        if snapshot:
            series.append(snapshot)
            print(f"[Temporal] {year}: LST={snapshot['lst']}°C, NDVI={snapshot['ndvi']}, Risk={snapshot['heatRisk']}%")
        else:
            print(f"[Temporal] {year}: No data available")

    if not series:
        return jsonify({"error": "No temporal data found for this location. The area may have insufficient satellite coverage."}), 404

    return jsonify({
        "location": {"lat": f_lat, "lng": f_lng},
        "series": series,
        "yearsRequested": years,
        "yearsReturned": len(series),
    })


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "capabilities": backend_capabilities(),
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    img_bytes = None
    use_gee = False
    f_lat = None
    f_lng = None
    bounds = None

    # 1. Processing Map Coordinates Request
    lat = request.form.get('lat')
    lng = request.form.get('lng')
    min_lat = request.form.get('minLat')
    max_lat = request.form.get('maxLat')
    min_lng = request.form.get('minLng')
    max_lng = request.form.get('maxLng')

    if lat and lng:
        try:
            f_lat = parse_float_field(lat, 'lat')
            f_lng = parse_float_field(lng, 'lng')
            if not (-90 <= f_lat <= 90 and -180 <= f_lng <= 180):
                return jsonify({"error": "Coordinates are out of range."}), 400
            bounds = parse_bounds(min_lat, max_lat, min_lng, max_lng)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        if bounds:
            print(f"Fetching satellite imagery for custom drawn bounds")
            arcgis_url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={bounds['minLng']},{bounds['minLat']},{bounds['maxLng']},{bounds['maxLat']}&bboxSR=4326&imageSR=4326&size=600,600&format=jpg&f=image"
            sources = [arcgis_url]
        else:
            d1 = 0.001
            d2 = 0.002
            print(f"Fetching satellite imagery for coordinates: {lat}, {lng}")
            arcgis_url_tight = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={f_lng-d1},{f_lat-d1},{f_lng+d1},{f_lat+d1}&bboxSR=4326&imageSR=4326&size=600,600&format=jpg&f=image"
            arcgis_url_wide = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={f_lng-d2},{f_lat-d2},{f_lng+d2},{f_lat+d2}&bboxSR=4326&imageSR=4326&size=600,600&format=jpg&f=image"
            zoom = 17
            gmaps_url = f"https://maps.googleapis.com/maps/api/staticmap?center={f_lat},{f_lng}&zoom={zoom}&size=600x600&maptype=satellite&key={API_KEY}"
            sources = [arcgis_url_tight, arcgis_url_wide, gmaps_url]

        img_bytes = None
        for attempt, src_url in enumerate(sources, start=1):
            try:
                src_name = "ArcGIS" if "arcgis" in src_url else "Google Maps Static"
                print(f"[Satellite] Attempt {attempt} ({src_name}): {src_url[:80]}...")
                resp = requests.get(src_url, timeout=SATELLITE_IMAGE_TIMEOUT_SECONDS)
                if resp.status_code == 200 and len(resp.content) > 5000:
                    # Verify this is actually an image (not an HTML error page)
                    content_type = resp.headers.get('Content-Type', '')
                    if 'html' not in content_type.lower():
                        img_bytes = resp.content
                        print(f"[Satellite] Success on attempt {attempt} ({src_name})")
                        break
                    else:
                        print(f"[Satellite] Attempt {attempt} returned HTML (server error), trying next source...")
                else:
                    print(f"[Satellite] Attempt {attempt} failed: HTTP {resp.status_code}, size={len(resp.content)}")
            except Exception as e:
                print(f"[Satellite] Attempt {attempt} exception: {e}")

        if img_bytes is None:
            return jsonify({"error": "All satellite image sources failed. Try selecting a different location or check your API keys."}), 500


        use_gee = GEE_AVAILABLE

    # 2. Processing Image Upload Request
    elif 'image' in request.files:
        file = request.files['image']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        img_bytes = file.read()

    else:
        return jsonify({"error": "Must provide either an image file or map lat/lng coordinates."}), 400


    # ===============================================================
    # IMAGE PROCESSING PIPELINE
    # ===============================================================
    try:
        npimg = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image payload retrieved"}), 400

        # Always run OpenCV analysis (for heatmap overlay & fallback)
        cv_result = analyze_image_opencv(img)

        # ---------------------------------------------------------------
        built_up_percent = cv_result['built_up']
        landcover_result = None
        landcover_status = "not_requested"

        # BRANCH: GEE Real Satellite Data vs OpenCV Fallback
        # ---------------------------------------------------------------
        if use_gee and f_lat is not None:
            print(f"[GEE] Querying Google Earth Engine for real satellite data...")

            # Fetch real Land Surface Temperature
            lst_celsius = get_lst_from_gee(f_lat, f_lng, bounds)

            # Fetch real spectral indices (NDVI, NDBI, NDWI)
            indices = get_ndvi_from_gee(f_lat, f_lng, bounds)

            if LANDCOVER_MODEL_AVAILABLE:
                stack = get_landcover_stack_from_gee(f_lat, f_lng, bounds)
                landcover_result = predict_landcover_from_stack(stack)
                landcover_result, landcover_status = validate_landcover_result(landcover_result, indices)

            if lst_celsius is not None and indices is not None:
                # Calculate risk using REAL satellite data
                heat_percent = calculate_gee_uhi_risk(lst_celsius, indices)
                if landcover_result:
                    green_cover_percent = landcover_result['green_cover']
                    water_cover = landcover_result['water_cover']
                    built_up_percent = landcover_result['built_up']
                    # NOTE: OpenCV masks are intentionally kept for the visual heatmap
                    # because they operate at native 600×600 and correctly detect
                    # individual rooftops. The U-Net's 64×64 masks upscaled to 600×600
                    # are too coarse — entire buildings get swallowed into green blocks.
                else:
                    green_cover_percent = indices['vegetation_cover']
                    water_cover = indices['water_cover']
                    built_up_percent = indices['built_up_cover']
                data_source = "satellite"

                print(f"[GEE] Results: LST={lst_celsius}C, NDVI={indices['ndvi']}, NDBI={indices['ndbi']}, NDWI={indices['ndwi']}")
                print(f"[GEE] Calculated UHI Risk: {heat_percent}%")
            else:
                # GEE returned no data — fall back to OpenCV
                print(f"[WARN] GEE returned no data for this location, using OpenCV fallback")
                lst_celsius = None
                indices = None
                heat_percent = cv_result['heat_risk']
                green_cover_percent = cv_result['green_cover']
                water_cover = cv_result['water_cover']
                data_source = "image_analysis"
        else:
            # Image upload mode — OpenCV only
            lst_celsius = None
            indices = None
            heat_percent = cv_result['heat_risk']
            green_cover_percent = cv_result['green_cover']
            water_cover = cv_result['water_cover']
            data_source = "image_analysis"

        print(f"Diagnostics: Source={data_source}, Green={green_cover_percent}%, Water={water_cover}% -> UHI Risk={heat_percent}%")

        # Generate Visual Heatmap Overlay
        heatmap_base64 = None
        if request.form.get('generate_heatmap') == 'true':
            heatmap_base64 = generate_heatmap_overlay(img, cv_result['green_mask'], cv_result['water_mask'])

        # ---------------------------------------------------------------
        # CONTEXT-AWARE TREE RECOMMENDATIONS
        # ---------------------------------------------------------------
        if water_cover > 5.0:
            tree_pool = ["Jamun", "Arjuna", "Silver Oak", "Bamboo"]
        elif heat_percent >= 80:
            tree_pool = ["Banyan", "Neem", "Peepal", "Acacia"]
        elif heat_percent >= 40:
            tree_pool = ["Mango", "Tamarind", "Mahogany", "Saptaparni"]
        else:
            tree_pool = ["Gulmohar", "Jacaranda", "Ashoka", "Amaltas"]

        # Stable output for the same input makes model results easier to compare.
        dynamic_suggestions = tree_pool[:3]

        # Temperature reduction projection
        if heat_percent >= 80:
            temp_red_text = "Estimated 3–5°C reduction in 5-7 years"
        elif heat_percent >= 40:
            temp_red_text = "Estimated 2–3°C reduction in 3-5 years"
        else:
            temp_red_text = "Estimated 1–2°C reduction in 2-4 years"

        # ---------------------------------------------------------------
        # BUILD RESPONSE
        # ---------------------------------------------------------------
        classification, classification_code = classify_heat_risk(heat_percent)
        response_data = {
            "heatRisk": heat_percent,
            "greenCover": green_cover_percent,
            "waterCover": water_cover,
            "classification": classification,
            "classification_code": classification_code,
            "suggestions": dynamic_suggestions,
            "tempReductionText": temp_red_text,
            "heatmap_image": heatmap_base64,
            "dataSource": data_source,
            "modelInfo": {
                "name": "GEE LST + spectral-index risk model",
                "fallback": "OpenCV vegetation/water/built-up analyzer",
                "uhiDetectorReference": "https://github.com/yotkadata/uhi_detector",
                "segmentationReady": LANDCOVER_MODEL_AVAILABLE,
                "segmentationUsed": landcover_result is not None,
                "segmentationStatus": landcover_status,
            },
            "capabilities": backend_capabilities(),
        }

        # Add real satellite data fields when available
        if data_source == "satellite":
            response_data["realTemperature"] = lst_celsius
            response_data["ndvi"] = indices['ndvi']
            response_data["ndbi"] = indices['ndbi']
            response_data["ndwi"] = indices['ndwi']
            response_data["vegetationCover"] = indices['vegetation_cover']
            response_data["denseVegetationCover"] = indices['dense_vegetation_cover']
            response_data["builtUpCover"] = indices['built_up_cover']
            response_data["builtUp"] = built_up_percent
            if landcover_result:
                sanitized_landcover = landcover_result.copy()
                sanitized_landcover.pop('green_mask', None)
                sanitized_landcover.pop('water_mask', None)
                response_data["landcover"] = sanitized_landcover
        else:
            # Image analysis mode — derive equivalent metrics from OpenCV
            response_data["builtUp"] = built_up_percent
            # Estimate surface temperature from built-up ratio:
            # Baseline 25°C + up to 20°C based on concrete density
            response_data["estimatedTemperature"] = estimate_surface_temperature(built_up_percent)

        return jsonify(response_data)

    except Exception as e:
        print(f"Routing/Prediction Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run the Flask app on localhost:5000
    app.run(host='0.0.0.0', port=5000, debug=True)
