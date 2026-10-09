import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
  Box,
  Typography,
  IconButton,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';

const API_URL = 'http://localhost:3000';

function ProfileSettings({ open, onClose, user, onProfileUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusMessage, setStatusMessage] = useState(user?.status_message || 'Hey there! I am using WhatsApp');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('profile_picture', file);

      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/users/profile-picture`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setSuccess('Profile picture updated successfully!');
        if (onProfileUpdate) {
          onProfileUpdate(response.data.user);
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePicture = async () => {
    if (!user?.profile_image_url) return;

    setError('');
    setSuccess('');
    setDeleting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`${API_URL}/api/users/profile-picture`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setSuccess('Profile picture removed successfully!');
        if (onProfileUpdate) {
          onProfileUpdate(response.data.user);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.response?.data?.error || 'Failed to delete profile picture');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusMessage.trim()) {
      setError('Status message cannot be empty');
      return;
    }

    setError('');
    setSuccess('');
    setUpdatingStatus(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_URL}/api/users/status`, {
        status_message: statusMessage
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setSuccess('Status updated successfully!');
        if (onProfileUpdate) {
          onProfileUpdate(response.data.user);
        }
      }
    } catch (err) {
      console.error('Update status error:', err);
      setError(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Profile Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2 }}>
          {/* Profile Picture */}
          <Box sx={{ position: 'relative', mb: 3 }}>
            <Avatar
              src={user?.profile_image_url}
              sx={{ width: 150, height: 150, bgcolor: '#25D366', fontSize: '48px' }}
            >
              {!user?.profile_image_url && user?.name?.charAt(0).toUpperCase()}
            </Avatar>
            
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="profile-picture-input"
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            
            <label htmlFor="profile-picture-input">
              <IconButton
                component="span"
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  bgcolor: '#25D366',
                  color: 'white',
                  '&:hover': { bgcolor: '#128C7E' }
                }}
                disabled={uploading}
              >
                {uploading ? <CircularProgress size={24} color="inherit" /> : <PhotoCameraIcon />}
              </IconButton>
            </label>

            {user?.profile_image_url && (
              <IconButton
                onClick={handleDeletePicture}
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  bgcolor: '#dc3545',
                  color: 'white',
                  '&:hover': { bgcolor: '#c82333' }
                }}
                disabled={deleting}
              >
                {deleting ? <CircularProgress size={24} color="inherit" /> : <DeleteIcon />}
              </IconButton>
            )}
          </Box>

          {/* User Info */}
          <Typography variant="h6" gutterBottom>
            {user?.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {user?.email}
          </Typography>

          {/* Status Message */}
          <Box sx={{ width: '100%', mt: 3 }}>
            <TextField
              fullWidth
              label="Status Message"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              multiline
              rows={2}
              variant="outlined"
              disabled={updatingStatus}
            />
            <Button
              fullWidth
              variant="contained"
              onClick={handleUpdateStatus}
              disabled={updatingStatus}
              sx={{ mt: 1, bgcolor: '#25D366', '&:hover': { bgcolor: '#128C7E' } }}
            >
              {updatingStatus ? <CircularProgress size={24} /> : 'Update Status'}
            </Button>
          </Box>

          {/* Error/Success Messages */}
          {error && (
            <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ width: '100%', mt: 2 }}>
              {success}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ProfileSettings;
