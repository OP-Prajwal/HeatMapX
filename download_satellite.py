import requests

lat = 28.660665
lng = 77.229050

# The same bounding box logic from app.py
d = 0.001
url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={lng-d},{lat-d},{lng+d},{lat+d}&bboxSR=4326&imageSR=4326&size=600,600&format=jpg&f=image"

print("Downloading satellite imagery from ArcGIS...")
print(f"URL: {url}")

response = requests.get(url)

if response.status_code == 200:
    filename = "downloaded_satellite.jpg"
    with open(filename, "wb") as f:
        f.write(response.content)
    print(f"Success! Saved to {filename}")
else:
    print(f"Failed to download! Status code: {response.status_code}")
    print(response.text)
