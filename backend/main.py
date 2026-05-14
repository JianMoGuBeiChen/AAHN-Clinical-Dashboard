from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from model import TransUnet_dis_graph_transfuse
from google import genai
from pydantic import BaseModel
from dotenv import load_dotenv
import nibabel as nib
import numpy as np
import shutil
import os
import torch
import torch.nn.functional as F
import traceback

app = FastAPI(title="Brain Tumor Segmentation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("temp_uploads", exist_ok=True)

# 1. INITIALIZE PYTORCH MODEL
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = TransUnet_dis_graph_transfuse(
    in_channels=3, 
    img_dim=128, 
    vit_blocks=8,
    vit_dim_linear_mhsa_block=512, 
    classes=4
).to(device)

model_weights_path = "best_model.pth"
if os.path.exists(model_weights_path):
    print("Loading AAHN Model Weights...")
    model.load_state_dict(torch.load(model_weights_path, map_location=device))
    is_model_loaded = True
else:
    print("No weights found. Defaulting to Prototype Mode.")
    is_model_loaded = False

model.eval()

# 2. CONFIGURE GEMINI
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

class ReportData(BaseModel):
    edema: float
    necrotic: float
    enhancing: float
    total_volume: float
    is_active: bool

def generate_radiology_prompt(vols, total_vol, active_status):
    """Helper to keep the prompt consistent between main and retry routes"""
    return f"""
    You are a Senior Neuroradiologist. Synthesize a formal, structured clinical MRI report.
    
    DATA:
    - Peritumoral Edema: {vols['edema']} mm³
    - Necrotic/Non-Enhancing Core: {vols['necrotic']} mm³
    - Active Enhancing Tumor: {vols['enhancing']} mm³
    - Total Lesion Volume: {total_vol} mm³

    STRUCTURE:
    ## EXAM: MRI BRAIN (AUTOMATED AI VOLUMETRIC ANALYSIS)
    ### CLINICAL INDICATION
    Automated segmentation and volumetric characterization of neuroepithelial tissue.
    ### TECHNIQUE
    Multi-parametric automated inference performed via Graph-TranFuse neural network.
    ### QUANTITATIVE FINDINGS
    * **Peritumoral Edema:** {vols['edema']} mm³
    * **Necrotic Core:** {vols['necrotic']} mm³
    * **Enhancing Tumor:** {vols['enhancing']} mm³
    **Total Calculated Lesion Burden:** {total_vol} mm³
    ### RADIOLOGICAL IMPRESSION
    Provide a 2-sentence clinical summary. Note that edema and necrosis suggest a complex pathological process.
    
    *** PRELIMINARY AI-GENERATED REPORT - FOR ACADEMIC/RESEARCH USE ONLY ***
    """

@app.post("/api/segment")
async def process_mri(file: UploadFile = File(...)):
    file_path = f"temp_uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        mri_img = nib.load(file_path)
        mri_data = mri_img.get_fdata()
        
        zooms = mri_img.header.get_zooms()
        voxel_vol = zooms[0] * zooms[1] * zooms[2] # mm³ per voxel

        mask_filename = f"mask_{file.filename}"
        mask_path = os.path.join("temp_uploads", mask_filename)

        if is_model_loaded:
            # --- 1. STRICT LIVE INFERENCE MODE (Slice-by-Slice) ---
            print("Running live AI Inference. This may take a moment...")
            
            # Get the original dimensions (e.g., 240, 240, 155)
            X, Y, Z = mri_data.shape
            
            # Create an empty 3D array to hold our final predictions
            predicted_3d_mask = np.zeros((X, Y, Z), dtype=np.int16)
            
            # Loop through every slice in the Z-axis
            for z in range(Z):
                slice_2d = mri_data[:, :, z]
                
                # Optimization: Skip purely black/empty background slices to save time
                if np.max(slice_2d) == 0:
                    continue
                    
                # 1. Convert to tensor: [1, 1, X, Y]
                slice_tensor = torch.from_numpy(slice_2d).float().unsqueeze(0).unsqueeze(0).to(device)
                
                # 2. Resize to 128x128 (what the model expects)
                slice_resized = F.interpolate(slice_tensor, size=(128, 128), mode='bilinear', align_corners=False)
                
                # 3. Duplicate 1 channel into 3 channels (RGB/Multi-modality mapping) for TransUnet
                slice_rgb = slice_resized.repeat(1, 3, 1, 1)
                
                # 4. Run through the model
                with torch.no_grad():
                    prediction = model(slice_rgb)
                    # Get the predicted class
                    pred_mask_128 = torch.argmax(prediction, dim=1).float().unsqueeze(1) # [1, 1, 128, 128]
                    
                # 5. Resize the mask back to the original X, Y dimensions
                pred_mask_original = F.interpolate(pred_mask_128, size=(X, Y), mode='nearest')
                
                # 6. Insert the predicted slice back into our 3D volume
                predicted_3d_mask[:, :, z] = pred_mask_original.squeeze().cpu().numpy()

            # Save the new predicted 3D mask as a real NIfTI file
            pred_img = nib.Nifti1Image(predicted_3d_mask, mri_img.affine, mri_img.header)
            nib.save(pred_img, mask_path)
            
            # Calculate true volumes directly from the AI's 3D prediction
            vols = {
                "necrotic": round(np.sum(predicted_3d_mask == 1) * voxel_vol, 2),
                "edema": round(np.sum(predicted_3d_mask == 2) * voxel_vol, 2),
                "enhancing": round(np.sum(predicted_3d_mask == 4) * voxel_vol, 2),
            }
            total_vol = round(vols["necrotic"] + vols["edema"] + vols["enhancing"], 2)
            print(f"Inference Complete. Total Tumor Burden: {total_vol} mm³")

        else:
            # --- 2. MOCK / PROTOTYPE MODE ---
            print("No model found. Using Prototype Mode (Mock Data)")
            vols = {"edema": 110.0, "necrotic": 71.0, "enhancing": 152.0}
            total_vol = 333.0
            
            # Copy original file so frontend download button doesn't 404
            shutil.copy(file_path, mask_path)

        prompt = generate_radiology_prompt(vols, total_vol, is_model_loaded)
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)

    except Exception as e:
        # If the model fails here, it will instantly return the error to the React frontend
        traceback.print_exc()
        return {"error": f"Model Inference Error: {str(e)}"}
    finally:
        if os.path.exists(file_path): os.remove(file_path)

    return {
        "tensor_shape": list(mri_data.shape),
        "ai_metrics": {
            "model_status": "Active" if is_model_loaded else "Placeholder",
            "edema": vols['edema'],
            "necrotic": vols['necrotic'],
            "enhancing": vols['enhancing'],
            "total_volume": total_vol
        },
        "ai_report": response.text,
        "mask_url": f"http://localhost:8000/api/download_mask/{mask_filename}"
    }

@app.post("/api/retry_report")
async def retry_report(data: ReportData):
    vols = {"edema": data.edema, "necrotic": data.necrotic, "enhancing": data.enhancing}
    prompt = generate_radiology_prompt(vols, data.total_volume, data.is_active)
    
    try:
        response = client.models.generate_content(model='gemini-1.5-flash', contents=prompt)
        return {"ai_report": response.text}
    except Exception as e:
        return {"ai_report": f"Retry failed: {str(e)}"}

@app.get("/api/download_mask/{filename}")
async def download_mask(filename: str):
    file_path = os.path.join("temp_uploads", filename)
    return FileResponse(path=file_path, filename=filename, media_type='application/octet-stream')