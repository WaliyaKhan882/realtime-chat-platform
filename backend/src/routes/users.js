const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');
const { uploadProfilePic } = require('../middleware/upload');

// All routes require authentication
router.use(authMiddleware);

router.get('/search', userController.searchUser);
router.get('/', userController.getAllUsers);
router.put('/status', userController.updateStatus);
router.post('/profile-picture', uploadProfilePic.single('profile_picture'), userController.uploadProfilePicture);
router.delete('/profile-picture', userController.deleteProfilePicture);

module.exports = router;
