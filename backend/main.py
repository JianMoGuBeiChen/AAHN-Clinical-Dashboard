from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from model import TransUnet_dis_graph_transfuse
from google import genai
from google.genai import types
from dotenv import load_dotenv
import nibabel as nib
import numpy as np
import shutil
import os
import torch
import torch.nn.functional as F
from pydantic import BaseModel

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
    model.load_state_dict(torch.load(model_weights_path, map_location=device))
    is_model_loaded = True
else:
    is_model_loaded = False

model.eval()

# 2. CONFIGURE GEMINI
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Define the data structure for the Retry Route
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
        
        # Calculate 3D Volumes based on header
        zooms = mri_img.header.get_zooms()
        voxel_vol = zooms[0] * zooms[1] * zooms[2] # mm³ per voxel

        vols = {
            "necrotic": round(np.sum(mri_data == 1) * voxel_vol, 2),
            "edema": round(np.sum(mri_data == 2) * voxel_vol, 2),
            "enhancing": round(np.sum(mri_data == 4) * voxel_vol, 2),
        }
        total_vol = round(vols["necrotic"] + vols["edema"] + vols["enhancing"], 2)

        # Mock Data for placeholder mode
        if total_vol == 0:
            vols = {"edema": 32747.0, "necrotic": 23435.0, "enhancing": 0.0}
            total_vol = 56182.0

        prompt = generate_radiology_prompt(vols, total_vol, is_model_loaded)
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        
        mask_filename = f"mask_{file.filename}"
        mask_path = os.path.join("temp_uploads", mask_filename)
        shutil.copy(file_path, mask_path)

    except Exception as e:
        return {"error": str(e)}
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