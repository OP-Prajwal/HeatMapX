from pathlib import Path

import requests


MODEL_URLS = {
    "landcover_unet_model.h5": "https://huggingface.co/bhargav37/lulc-dl-model/resolve/main/landcover_unet_model.h5",
}


def download_file(url, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with output_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)


def main():
    models_dir = Path(__file__).parent / "models"
    for filename, url in MODEL_URLS.items():
        output_path = models_dir / filename
        if output_path.exists():
            print(f"Already exists: {output_path}")
            continue
        print(f"Downloading {filename}...")
        download_file(url, output_path)
        print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
