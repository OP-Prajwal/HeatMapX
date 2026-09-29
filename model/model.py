ifrom flask import Flask, render_template, request
from tensorflow.keras.models import load_model
import cv2
import numpy as np

app = Flask(__name__)

model = load_model('urban_heat_model.keras')

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    file = request.files['image']

    img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (64, 64))
    img = img / 255.0
    img = np.expand_dims(img, axis=0)

    prediction = model.predict(img)[0][0]

    heat_percent = round(prediction * 100, 2)

    if heat_percent > 70:
        result = f"Heat Risk: {heat_percent}% - High Urban Heat Island Risk. Suggested Trees: Neem, Rain Tree, Banyan."
    elif heat_percent > 40:
        result = f"Heat Risk: {heat_percent}% - Moderate Heat Risk. Suggested Trees: Neem, Mango."
    else:
        result = f"Heat Risk: {heat_percent}% - Safe / Green Area."

    return render_template('index.html', result=result)

if __name__ == '__main__':
    app.run(debug=True)