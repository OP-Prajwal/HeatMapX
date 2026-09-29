import sys
import os

# Suppress TF logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 

import tensorflow as tf
import numpy as np

model_path = 'urban_heat_model_fixed.keras'

try:
    print("Loading model from:", model_path)
    model = tf.keras.models.load_model(model_path)
    print("\n--- Model Architecture ---")
    model.summary()
    
    print("\n--- Testing Prediction ---")
    dummy_image = np.random.random((1, 64, 64, 3))
    prediction = model.predict(dummy_image, verbose=0)
    print(f"Dummy Image Shape: {dummy_image.shape}")
    print(f"Raw Prediction Output: {prediction[0][0]}")
    print(f"Simulated Heat Risk: {round(prediction[0][0] * 100, 2)}%")
    print("\nVerification Successful: Model is healthy and responsive.")
except Exception as e:
    print("\nError verifying model:")
    print(e)
