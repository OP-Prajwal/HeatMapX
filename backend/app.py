import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_login import LoginManager
from dotenv import load_dotenv
import cv2
import numpy as np
import base64
from tensorflow.keras.models import load_model

from models import db, User
from auth import auth_bp

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# --- App / session configuration ---------------------------------------
# SECRET_KEY signs the session cookie used for login state. Set a real,
# random value via the SECRET_KEY env var in production.
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-me')

# --- Database (SQLite via SQLAlchemy) -----------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL', f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    db.create_all()

# --- Session cookie settings ---------------------------------------------
# Lax works for local dev even across ports (5173 <-> 5000) because
# SameSite is evaluated per registrable domain ("site"), not per port.
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
# Only send the cookie over HTTPS once deployed behind TLS.
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'

# --- Flask-Login -----------------------------------------------------------
login_manager = LoginManager()
login_manager.init_app(app)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"error": "Authentication required."}), 401

# --- CORS ------------------------------------------------------------------
# supports_credentials + an explicit origin (not '*') are required so the
# browser will actually send/receive the session cookie cross-origin.
FRONTEND_ORIGIN = os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173')
CORS(app, supports_credentials=True, origins=[FRONTEND_ORIGIN])

# --- Register the new authentication API ------------------------------
app.register_blueprint(auth_bp)

API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')

# Attempt to load the model robustly
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'model', 'urban_heat_model.keras')

try:
    if os.path.exists(MODEL_PATH):
        model = load_model(MODEL_PATH)
        print(f"Loaded model successfully from {MODEL_PATH}")
    else:
        print(f"Warning: Model not found at {MODEL_PATH}. Prediction will return fallback/randomized data.")
        model = None
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

@app.route('/api/predict', methods=['POST'])
def predict():
    img_bytes = None
    
    # 1. Processing Map Coordinates Request
    lat = request.form.get('lat')
    lng = request.form.get('lng')
    
    if lat and lng:
        if not API_KEY:
            return jsonify({"error": "Google Maps API Key is missing. Add it to backend/.env file."}), 500
            
        print(f"Fetching Satellite Data for coordinates: {lat}, {lng}")
        url = f"https://maps.googleapis.com/maps/api/staticmap?center={lat},{lng}&zoom=18&size=600x600&maptype=satellite&key={API_KEY}"
        
        try:
            response = requests.get(url)
            if response.status_code == 200:
                img_bytes = response.content
            else:
                return jsonify({"error": f"Failed to fetch map data: {response.text}"}), 400
        except Exception as e:
            return jsonify({"error": f"Request to Google Maps Failed: {str(e)}"}), 500
            
    # 2. Processing Image Upload Request
    elif 'image' in request.files:
        file = request.files['image']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        img_bytes = file.read()
        
    else:
        return jsonify({"error": "Must provide either an image file or map lat/lng coordinates."}), 400


    # Image Processing (Common Pipeline)
    try:
        # Read the file bytes to numpy array
        npimg = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({"error": "Invalid image payload retrieved"}), 400
            
        # Optional: Calculate green cover purely via OpenCV (HSV masking)
        hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # Define range of 'green' in HSV
        lower_green = np.array([35, 40, 40])
        upper_green = np.array([85, 255, 255])
        
        mask = cv2.inRange(hsv_img, lower_green, upper_green)
        green_ratio = cv2.countNonZero(mask) / (img.shape[0] * img.shape[1])
        green_cover_percent = round(green_ratio * 100, 2)
        
        heat_percent = 0.0

        if model is not None:
            img_resized = cv2.resize(img, (64, 64))
            img_resized = img_resized / 255.0
            img_resized = np.expand_dims(img_resized, axis=0)

            # Predict using the Deep Learning Model
            prediction = model.predict(img_resized)[0][0]
            heat_percent = round(float(prediction * 100), 2)
        else:
            # Fallback heuristic if model is missing: inversely proportional to Green Cover
            heat_percent = round(max(0, 100 - (green_cover_percent * 1.5) + np.random.uniform(-5, 15)), 2)
            heat_percent = min(100, heat_percent)

        # Generate Visual Heatmap Overlay if requested
        heatmap_base64 = None
        if request.form.get('generate_heatmap') == 'true':
            # Create a thermal interpretation:
            # 1. Non-green areas (concrete, roads) absorb heat
            # Invert the green mask to find concrete/buildings
            concrete_mask = cv2.bitwise_not(mask)
            
            # Apply Gaussian blur to simulate thermal radiation expanding across the zone
            thermal_spread = cv2.GaussianBlur(concrete_mask, (101, 101), 0)
            
            # Apply color mapping (Jet: Blue=Cool, Red=Hot)
            heatmap_color = cv2.applyColorMap(thermal_spread, cv2.COLORMAP_JET)
            
            # Blend thermal layer over original satellite imagery (50% overlay)
            blended_image = cv2.addWeighted(heatmap_color, 0.4, img, 0.6, 0)
            
            # Encode as base64 jpeg
            _, buffer = cv2.imencode('.jpg', blended_image)
            heatmap_base64 = base64.b64encode(buffer).decode('utf-8')

        # Recommendation Logic based on requirements
        if heat_percent > 70:
            classification = "High Urban Heat Island Risk"
            class_code = "high"
            suggestions = ["Neem", "Rain Tree", "Banyan"]
            temp_reduction = "Estimated 2–4°C reduction in 3–5 years"
        elif heat_percent > 40:
            classification = "Moderate Heat Risk"
            class_code = "moderate"
            suggestions = ["Gulmohar", "Ashoka"]
            temp_reduction = "Estimated 1–2°C reduction in 3–5 years"
        else:
            classification = "Safe Area / Low Heat"
            class_code = "safe"
            suggestions = ["Maintain existing greenery", "Plant native shrubs"]
            temp_reduction = "Minimal change required, existing temperatures are optimal."

        payload = {
            "heatRisk": heat_percent,
            "greenCover": green_cover_percent,
            "classification": classification,
            "classification_code": class_code,
            "suggestions": suggestions,
            "tempReductionText": temp_reduction
        }
        
        if heatmap_base64:
            payload["heatmap_image"] = heatmap_base64

        return jsonify(payload)

    except Exception as e:
        print(f"Routing/Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run the Flask app on localhost:5000
    app.run(host='0.0.0.0', port=5000, debug=True)
