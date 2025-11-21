# BeautiQ Backend - AWS S3 Integration

## 🚀 Quick Setup

### AWS S3 Configuration
Your AWS credentials are already configured in `.env`:
- **Region**: `eu-north-1`
- **Bucket**: `mybeautiq-bucket`

### Required: Configure S3 Bucket

1. **Create Bucket** (if not exists)
   - Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
   - Create bucket: `mybeautiq-bucket` in `eu-north-1` region
   - Uncheck "Block all public access"

2. **Add Bucket Policy**
   - Go to bucket → Permissions → Bucket Policy
   - Paste this policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::mybeautiq-bucket/*"
     }]
   }
   ```

3. **Add CORS Configuration**
   - Go to bucket → Permissions → CORS
   - Paste this:
   ```json
   [{
     "AllowedHeaders": ["*"],
     "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
     "AllowedOrigins": ["*"],
     "ExposeHeaders": []
   }]
   ```

## 📝 Features Implemented

### Admin Profile Management (NEW) ✨
- ✅ Admin can update profile without approval
- ✅ Fields: Full Name, Email, Mobile Number, Address
- ✅ Password reset via email verification
- ✅ Route: `PUT /api/auth/admin/update-profile`
- ✅ Access: Admin role only
- ✅ **IMPORTANT**: Must restart backend server after code changes

**⚠️ Troubleshooting 404 Error:**
If you get a 404 error when updating admin profile:
1. **Stop the backend server** (Ctrl+C in terminal)
2. **Restart the backend:** `npm start`
3. **Refresh the browser**
4. **Try updating profile again**

The route is configured in `server.js` line ~256:
```javascript
app.put('/api/auth/admin/update-profile', rbac(['admin']), adminUpdateProfile);
```

### Image Uploads
- ✅ Profile photos for all user types (customer, admin, serviceProvider)
- ✅ NIC front/back photos (service providers)
- ✅ Certificates - up to 5 files (service providers)
- ✅ All files stored in AWS S3 cloud storage
- ✅ Automatic folder organization in S3

### API Endpoints

#### Registration (with image uploads)
```http
POST /api/auth/register-customer
POST /api/auth/register-service-provider
POST /api/auth/register-admin
Content-Type: multipart/form-data

Fields: profilePhoto (file)
Service Provider also: nicFrontPhoto, nicBackPhoto, certificatesPhotos (files)
```

#### Update Profile Photo (NEW)
```http
PUT /api/auth/profile-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body: profilePhoto (file)
Response: { success: true, data: { profilePhoto: "S3_URL" } }
```

#### Admin View Images
```http
GET /api/admin/images/:type/:id/:field?index=0
Authorization: Bearer <admin_token>

Examples:
- /api/admin/images/user/123abc/profilePhoto
- /api/admin/images/user/123abc/nicFrontPhoto
- /api/admin/images/user/123abc/certificatesPhotos?index=0
```

## 💻 Frontend Integration

### Display Profile Images
```jsx
// Profile photos are S3 URLs - use directly
<img src={user.profilePhoto} alt={user.fullName} />
```

### Upload Profile Photo
```javascript
const formData = new FormData();
formData.append('profilePhoto', fileInput.files[0]);

const response = await fetch('/api/auth/profile-photo', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const data = await response.json();
// data.data.profilePhoto contains new S3 URL
```

### Registration with Images
```javascript
const formData = new FormData();
formData.append('fullName', 'John Doe');
formData.append('emailAddress', 'john@example.com');
formData.append('password', 'SecurePass123');
formData.append('profilePhoto', profilePhotoFile);

// For service providers, also add:
formData.append('nicFrontPhoto', nicFrontFile);
formData.append('nicBackPhoto', nicBackFile);
formData.append('certificatesPhotos', cert1File);
formData.append('certificatesPhotos', cert2File);

await fetch('/api/auth/register-service-provider', {
  method: 'POST',
  body: formData
});
```

## 📁 File Structure

### New Files
- `config/s3.js` - AWS S3 configuration and helper functions
- `middleware/uploadMiddleware.js` - Multer-S3 upload middleware

### Updated Files
- `.env` - AWS credentials configured
- `server.js` - S3 routes and middleware integrated
- `controllers/authController.js` - S3 file handling + `updateProfilePhoto` function

### S3 Folder Organization
```
mybeautiq-bucket/
├── profiles/          (profile photos for all users)
├── nic-documents/     (NIC front/back for service providers)
├── certificates/      (certificates for service providers)
└── services/          (service images)
```

## 🔒 Security
- Authentication required for uploads
- Role-based access control (RBAC)
- File type validation (images only)
- File size limit (10MB)
- Automatic old photo deletion when updating

## 🧪 Testing

1. Start server: `npm start`
2. Test customer registration with profile photo
3. Test service provider registration with all photos
4. Test profile photo update endpoint
5. Verify images appear in S3 bucket
6. Test admin image viewing

## ⚠️ Important Notes

- Never commit `.env` file (already in .gitignore)
- S3 URLs are public - anyone with URL can view
- Old photos automatically deleted when updating
- All code is fully commented for understanding

## 📊 Database Schema

User model stores S3 URLs:
```javascript
{
  profilePhoto: "https://mybeautiq-bucket.s3.eu-north-1.amazonaws.com/profiles/...",
  nicFrontPhoto: "https://mybeautiq-bucket.s3.eu-north-1.amazonaws.com/nic-documents/...",
  nicBackPhoto: "https://mybeautiq-bucket.s3.eu-north-1.amazonaws.com/nic-documents/...",
  certificatesPhotos: ["https://mybeautiq-bucket.s3.eu-north-1.amazonaws.com/certificates/..."]
}
```

## 🎯 Key Features

1. **Profile photos for all users** - Added during registration and updatable
2. **Service provider documents** - NIC photos + certificates stored in S3
3. **Admin image viewing** - View all provider images via API
4. **Automatic cleanup** - Old photos deleted when updating
5. **Cloud storage** - No local storage used, unlimited scalability

---

**Status**: ✅ Ready for testing  
**Next Step**: Configure S3 bucket permissions, then test!
