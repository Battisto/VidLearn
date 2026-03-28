import sys
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime
from bson import ObjectId
from typing import Optional

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import UserCreate, UserLogin, UserResponse, Token
from loguru import logger

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/login", auto_error=False)

async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
        
    db = get_db()
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if user:
        user["_id"] = str(user["_id"])
    return user

async def get_current_user(user: Optional[dict] = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

@router.post("/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    try:
        db = get_db()
        existing = await db["users"].find_one({"email": user.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
            
        hashed_password = get_password_hash(user.password)
        new_user = {
            "email": str(user.email),
            "full_name": user.full_name,
            "hashed_password": hashed_password,
            "created_at": datetime.utcnow()
        }
        
        result = await db["users"].insert_one(new_user)
        user_id = str(result.inserted_id)
        
        # Prepare response explicitly
        response_data = {
            "id": user_id,
            "email": new_user["email"],
            "full_name": new_user["full_name"],
            "created_at": new_user["created_at"]
        }
        return UserResponse(**response_data)
    except Exception as e:
        logger.exception(f"Registration failed: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin):
    db = get_db()
    user = await db["users"].find_one({"email": user_credentials.email})
    
    if not user or not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    access_token = create_access_token(data={"sub": str(user["_id"])})
    user["_id"] = str(user["_id"])
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user": UserResponse(**user)
    }

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
