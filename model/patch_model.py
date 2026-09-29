import zipfile
import json
import os
import shutil

model_path = 'urban_heat_model.keras'
temp_dir = 'temp_keras_extract'

try:
    os.makedirs(temp_dir, exist_ok=True)
    with zipfile.ZipFile(model_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)

    config_path = os.path.join(temp_dir, 'config.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        config_data = json.load(f)

    # Recursively remove 'quantization_config'
    def remove_key(d, key_to_remove):
        if isinstance(d, dict):
            d.pop(key_to_remove, None)
            for k, v in d.items():
                remove_key(v, key_to_remove)
        elif isinstance(d, list):
            for item in d:
                remove_key(item, key_to_remove)

    remove_key(config_data, 'quantization_config')

    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config_data, f)

    fixed_model_path = 'urban_heat_model_fixed.keras'
    with zipfile.ZipFile(fixed_model_path, 'w') as zipf:
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, temp_dir).replace('\\', '/')
                zipf.write(file_path, arcname)

    print("Fixed model saved to", fixed_model_path)

finally:
    # Cleanup
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
