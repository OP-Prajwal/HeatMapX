# Model Artifacts

Place downloaded model files in this folder.

Current optional land-cover segmentation model:

- `landcover_unet_model.h5`
- Source: https://huggingface.co/bhargav37/lulc-dl-model
- Direct download: https://huggingface.co/bhargav37/lulc-dl-model/resolve/main/landcover_unet_model.h5

Download it with:

```powershell
python backend\download_models.py
```

Model binaries are ignored by Git to keep the repository light. The downloaded
file should stay local unless you intentionally decide to track model artifacts.
