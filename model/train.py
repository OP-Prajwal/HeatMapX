import os
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Dense, Flatten, Dropout
from tensorflow.keras.preprocessing.image import ImageDataGenerator

# Assuming a standard directory structure:
# dataset/
# ├── safe/          # Green areas
# └── heat_risk/     # High Urban Heat Island Risk

DATASET_DIR = "dataset/" 
IMG_SIZE = (64, 64)
BATCH_SIZE = 32
EPOCHS = 20

def build_model():
    model = Sequential([
        # 1st Convolutional Layer
        Conv2D(32, (3, 3), activation='relu', input_shape=(IMG_SIZE[0], IMG_SIZE[1], 3)),
        MaxPooling2D(pool_size=(2, 2)),
        
        # 2nd Convolutional Layer
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(pool_size=(2, 2)),
        
        # 3rd Convolutional Layer
        Conv2D(128, (3, 3), activation='relu'),
        MaxPooling2D(pool_size=(2, 2)),
        
        # Flatten and Dense Layers
        Flatten(),
        Dense(128, activation='relu'),
        Dropout(0.5), # Prevent overfitting
        # Output layer for binary classification (0 or 1, safe vs heat)
        Dense(1, activation='sigmoid')
    ])
    
    model.compile(optimizer='adam', 
                  loss='binary_crossentropy', 
                  metrics=['accuracy'])
    return model

def train():
    if not os.path.exists(DATASET_DIR):
        print(f"Error: Dataset directory '{DATASET_DIR}' not found.")
        print("Please ensure your dataset is structured correctly.")
        return

    # Data augmentation for robust training
    datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        horizontal_flip=True,
        validation_split=0.2 # Use 20% for validation
    )

    train_generator = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='binary',
        subset='training'
    )

    validation_generator = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='binary',
        subset='validation'
    )

    model = build_model()
    model.summary()

    # Train the model
    # Note: steps_per_epoch is determined automatically if omitted in modern TF
    model.fit(
        train_generator,
        validation_data=validation_generator,
        epochs=EPOCHS
    )

    # Save the model
    model.save('urban_heat_model.keras')
    print("Model saved to 'urban_heat_model.keras'")

if __name__ == '__main__':
    train()
