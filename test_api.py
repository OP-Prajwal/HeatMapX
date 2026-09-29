import requests
import base64
import os

locations = {
    "airport": (28.5562, 77.1000),
    "park": (28.5933, 77.2197),
    "lake": (28.5411, 77.1925)
}

for name, (lat, lng) in locations.items():
    print(f"Testing {name} at {lat}, {lng}...")
    data = {
        'lat': lat,
        'lng': lng,
        'generate_heatmap': 'true'
    }
    try:
        res = requests.post("http://localhost:5000/api/predict", data=data)
        if res.status_code == 200:
            result = res.json()
            print(f"[{name}] Success!")
            print(f"  Heat Risk: {result.get('heatRisk')}%")
            print(f"  Green Cover: {result.get('greenCover')}%")
            print(f"  Water Cover: {result.get('waterCover')}%")
            print(f"  Built Up: {result.get('builtUp')}%")
            print(f"  Source: {result.get('dataSource')}")
            
            heatmap_b64 = result.get('heatmap_image')
            if heatmap_b64:
                with open(f"test_heatmap_{name}.jpg", "wb") as f:
                    f.write(base64.b64decode(heatmap_b64))
                print(f"  Saved heatmap to test_heatmap_{name}.jpg")
            else:
                print("  No heatmap returned.")
        else:
            print(f"[{name}] Error: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"[{name}] Exception: {e}")

print("Done testing.")
