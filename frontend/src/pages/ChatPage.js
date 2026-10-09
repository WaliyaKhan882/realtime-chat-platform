import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  TextField,
  IconButton,
  Typography,
  AppBar,
  Toolbar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BarChartIcon from '@mui/icons-material/BarChart';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import CircularProgress from '@mui/material/CircularProgress';
import GroupsIcon from '@mui/icons-material/Groups';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import ProfileSettings from '../components/ProfileSettings';

const API_URL = 'http://localhost:3000';

function ChatPage() {
  const navigate = useNavigate();
  const { user, socket, logout } = useAuth();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [openNewChat, setOpenNewChat] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openStatusDialog, setOpenStatusDialog] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [openGroupDialog, setOpenGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [openProfileSettings, setOpenProfileSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (chats.length > 0) {
      loadOnlineStatus();
    }
  }, [chats]);

  useEffect(() => {
    if (socket) {
      // Load online status on mount
      loadOnlineStatus();

      // Send heartbeat every 20 seconds to keep user online
      const heartbeatInterval = setInterval(() => {
        socket.emit('heartbeat');
      }, 20000);

      // Refresh online status every 30 seconds
      const statusInterval = setInterval(() => {
        loadOnlineStatus();
      }, 30000);

      const handleReceiveMessage = (message) => {
        console.log('📨 Received message:', message);
        
        // Emit message-delivered event for received messages (not sent by me)
        const senderId = message.sender_id?._id || message.sender_id;
        const hasRealId = message._id && !message._id.toString().startsWith('temp-');
        
        if (senderId !== user.id && hasRealId) {
          setTimeout(() => {
            console.log('📤 Emitting delivered for received message:', message._id);
            socket.emit('message-delivered', { 
              messageId: message._id, 
              chatId: message.chat_id 
            });
          }, 100);
        }
        
        setMessages(prev => {
          // Only add if it's for the currently selected chat
          if (selectedChat && message.chat_id === selectedChat._id) {
            return [...prev, message];
          }
          return prev;
        });
      };

      // Online status updates
      const handleUserOnline = ({ userId }) => {
        console.log('✅ User came online:', userId);
        setOnlineUsers(prev => {
          const newState = { ...prev, [userId]: true };
          console.log('Updated onlineUsers:', newState);
          return newState;
        });
      };

      const handleUserOffline = ({ userId, lastSeen: ls }) => {
        console.log('❌ User went offline:', userId, ls);
        setOnlineUsers(prev => {
          const newState = { ...prev, [userId]: false };
          console.log('Updated onlineUsers:', newState);
          return newState;
        });
        setLastSeen(prev => ({ ...prev, [userId]: ls }));
      };

      // Typing indicators
      const handleUserTyping = ({ userId, chatId, isTyping }) => {
        if (selectedChat && chatId === selectedChat._id) {
          setTypingUsers(prev => ({ ...prev, [userId]: isTyping }));
        }
      };

      // Status updates
      const handleStatusUpdate = ({ userId, status_message }) => {
        console.log('📢 Status updated:', userId, status_message);
        setChats(prevChats => 
          prevChats.map(chat => ({
            ...chat,
            participants: chat.participants.map(p => 
              p._id === userId ? { ...p, status_message } : p
            )
          }))
        );
      };

      // Profile picture updates
      const handleProfileUpdate = ({ userId, profile_image_url }) => {
        console.log('📸 Profile picture updated:', userId, profile_image_url);
        setChats(prevChats => 
          prevChats.map(chat => ({
            ...chat,
            participants: chat.participants.map(p => 
              p._id === userId ? { ...p, profile_image_url } : p
            )
          }))
        );
        // Update current user if it's their profile
        if (userId === user.id) {
          setCurrentUser(prev => ({ ...prev, profile_image_url }));
        }
      };

      // Message deletions
      const handleMessageDeleted = ({ chatId, messageId, deleteForEveryone }) => {
        console.log('🗑️ Message deleted:', messageId, 'from chat:', chatId, 'for everyone:', deleteForEveryone);
        if (selectedChat && selectedChat._id === chatId) {
          setMessages(prev => prev.filter(msg => msg._id !== messageId));
        }
      };

      // Message deleted for specific user
      const handleMessageDeletedForUser = ({ chatId, messageId, userId }) => {
        // Only remove from this user's view if it's for them
        if (userId === user.id && selectedChat && selectedChat._id === chatId) {
          console.log('🗑️ Message deleted for me:', messageId);
          setMessages(prev => prev.filter(msg => msg._id !== messageId));
        }
      };

      // Group updates
      const handleGroupUpdated = ({ groupId }) => {
        console.log('👥 Group updated:', groupId);
        loadChats(); // Reload chats to get updated group info
      };

      // Message status updates
      const handleMessageStatusUpdated = ({ messageId, status, userId: updateUserId }) => {
        console.log('✓ Message status updated:', messageId, 'to', status, 'by user:', updateUserId);
        setMessages(prev => prev.map(msg => {
          if (msg._id === messageId) {
            const updated = { ...msg, status };
            // Update delivered_to or seen_by arrays
            if (status === 'delivered' && !msg.delivered_to?.includes(updateUserId)) {
              updated.delivered_to = [...(msg.delivered_to || []), updateUserId];
              console.log('✓✓ Updated delivered_to:', updated.delivered_to);
            } else if (status === 'seen' && !msg.seen_by?.includes(updateUserId)) {
              updated.seen_by = [...(msg.seen_by || []), updateUserId];
              console.log('✓✓ Updated seen_by:', updated.seen_by);
            }
            return updated;
          }
          return msg;
        }));
      };

      // Update message IDs when they're saved to MongoDB
      const handleMessageIdUpdate = ({ tempId, realId, message }) => {
        console.log('🔄 Message ID updated:', tempId, '→', realId);
        setMessages(prev => prev.map(msg => {
          if (msg._id === tempId) {
            return { ...msg, _id: realId };
          }
          return msg;
        }));
        
        // Emit delivered status for the real message ID after a small delay
        if (message.sender_id._id !== user.id && realId) {
          setTimeout(() => {
            console.log('📤 Emitting delivered for:', realId);
            socket.emit('message-delivered', { 
              messageId: realId, 
              chatId: message.chat_id 
            });
          }, 100); // Small delay to ensure state is updated
        }
      };

      socket.on('receive-message', handleReceiveMessage);
      socket.on('user-online', handleUserOnline);
      socket.on('user-offline', handleUserOffline);
      socket.on('user-typing', handleUserTyping);
      socket.on('user-status-updated', handleStatusUpdate);
      socket.on('user-profile-updated', handleProfileUpdate);
      socket.on('message-deleted', handleMessageDeleted);
      socket.on('message-deleted-for-user', handleMessageDeletedForUser);
      socket.on('group-updated', handleGroupUpdated);
      socket.on('message-status-updated', handleMessageStatusUpdated);
      socket.on('message-id-update', handleMessageIdUpdate);

      return () => {
        clearInterval(heartbeatInterval);
        clearInterval(statusInterval);
        socket.off('receive-message', handleReceiveMessage);
        socket.off('user-online', handleUserOnline);
        socket.off('user-offline', handleUserOffline);
        socket.off('user-typing', handleUserTyping);
        socket.off('user-status-updated', handleStatusUpdate);
        socket.off('user-profile-updated', handleProfileUpdate);
        socket.off('message-deleted', handleMessageDeleted);
        socket.off('message-deleted-for-user', handleMessageDeletedForUser);
        socket.off('group-updated', handleGroupUpdated);
        socket.off('message-status-updated', handleMessageStatusUpdated);
        socket.off('message-id-update', handleMessageIdUpdate);
      };
    }
  }, [socket, selectedChat]);

  // Emit message-delivered for loaded messages that haven't been delivered yet
  useEffect(() => {
    if (selectedChat && messages.length > 0 && socket) {
      messages.forEach(msg => {
        const isSent = msg.sender_id._id === user.id || msg.sender_id === user.id;
        const hasRealId = msg._id && !msg._id.toString().startsWith('temp-');
        const notDelivered = msg.status === 'sent' && !msg.delivered_to?.includes(user.id);
        
        if (!isSent && hasRealId && notDelivered) {
          console.log('📤 Emitting delivered for loaded message:', msg._id);
          socket.emit('message-delivered', { messageId: msg._id, chatId: selectedChat._id });
        }
      });
    }
  }, [messages, selectedChat, socket, user.id]);

  // Emit message-seen events when messages are viewed (with delay to allow delivered status)
  useEffect(() => {
    if (selectedChat && messages.length > 0 && socket) {
      // Add a small delay to allow delivered status to be processed first
      const seenTimer = setTimeout(() => {
        messages.forEach(msg => {
          // Only emit seen for messages sent by others that are delivered but not seen yet
          const isSent = msg.sender_id._id === user.id || msg.sender_id === user.id;
          const hasRealId = msg._id && !msg._id.toString().startsWith('temp-');
          const isDelivered = msg.status === 'delivered' || msg.delivered_to?.includes(user.id);
          const notSeenYet = msg.status !== 'seen' && !msg.seen_by?.includes(user.id);
          
          if (!isSent && hasRealId && isDelivered && notSeenYet) {
            socket.emit('message-seen', { messageId: msg._id, chatId: selectedChat._id });
          }
        });
      }, 1000); // Wait 1 second to allow delivered status to be processed
      
      return () => clearTimeout(seenTimer);
    }
  }, [messages, selectedChat, socket, user.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadAllUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/users`);
      setAllUsers(res.data.users.filter(u => u._id !== user.id));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alert('Please enter a group name');
      return;
    }
    if (selectedMembers.length === 0) {
      alert('Please select at least one member');
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/api/groups`, {
        name: groupName,
        member_ids: selectedMembers,
        description: groupDescription
      });
      
      const chatId = res.data.chat_id;
      
      // Reload chats to include the new group
      await loadChats();
      
      // Find and select the new group chat
      const newChat = chats.find(c => c._id === chatId) || (await axios.get(`${API_URL}/api/chats`)).data.chats.find(c => c._id === chatId);
      if (newChat) {
        setSelectedChat(newChat);
        loadMessages(newChat._id);
      }
      
      setOpenGroupDialog(false);
      setGroupName('');
      setGroupDescription('');
      setSelectedMembers([]);
      alert('Group created successfully!');
    } catch (error) {
      console.error('Error creating group:', error);
      alert(error.response?.data?.error || 'Failed to create group');
    }
  };

  const handleOpenGroupDialog = () => {
    loadAllUsers();
    setOpenGroupDialog(true);
  };

  const handleMemberToggle = (userId) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getMessageStatusIcon = (msg) => {
    const isSent = msg.sender_id._id === user.id || msg.sender_id === user.id;
    if (!isSent) return null; // Only show status on sent messages

    // Check if message has been seen
    const hasSeen = msg.status === 'seen' || (Array.isArray(msg.seen_by) && msg.seen_by.length > 0);
    // Check if message has been delivered
    const hasDelivered = msg.status === 'delivered' || (Array.isArray(msg.delivered_to) && msg.delivered_to.length > 0);

    if (hasSeen) {
      return <DoneAllIcon sx={{ fontSize: 16, color: '#4FC3F7', ml: 0.5 }} />; // Blue double check
    } else if (hasDelivered) {
      return <DoneAllIcon sx={{ fontSize: 16, color: '#667781', ml: 0.5 }} />; // Gray double check
    } else {
      return <DoneIcon sx={{ fontSize: 16, color: '#667781', ml: 0.5 }} />; // Single gray check (sent)
    }
  };

  const loadOnlineStatus = async () => {
    if (!user || chats.length === 0) return;
    
    try {
      // Get all unique user IDs from chats
      const userIds = [...new Set(chats.flatMap(chat => 
        chat.participants.map(p => p._id).filter(id => id !== user.id)
      ))];
      
      if (userIds.length === 0) return;

      const res = await axios.post(`${API_URL}/api/presence/bulk-status`, { userIds });
      const statuses = res.data.statuses || {};
      
      const online = {};
      const lastSeenData = {};
      
      Object.entries(statuses).forEach(([userId, status]) => {
        online[userId] = status.isOnline;
        if (status.lastSeen) {
          lastSeenData[userId] = status.lastSeen;
        }
      });
      
      setOnlineUsers(online);
      setLastSeen(lastSeenData);
    } catch (error) {
      console.error('Error loading online status:', error);
    }
  };

  const loadChats = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/chats`);
      setChats(res.data.chats);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  const loadMessages = async (chatId) => {
    try {
      const res = await axios.get(`${API_URL}/api/chats/${chatId}/messages`);
      setMessages(res.data.messages);
      
      // Join the chat room via socket
      if (socket) {
        socket.emit('join-chat', chatId);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleChatSelect = (chat) => {
    setSelectedChat(chat);
    loadMessages(chat._id);
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedChat || !socket) return;

    const messageData = {
      chat_id: selectedChat._id,
      content: messageInput.trim()
    };

    socket.emit('send-message', messageData);
    setMessageInput('');
    
    // Stop typing indicator
    if (socket && selectedChat) {
      socket.emit('typing', { chatId: selectedChat._id, isTyping: false });
    }
  };

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);
    
    // Send typing indicator
    if (socket && selectedChat) {
      socket.emit('typing', { chatId: selectedChat._id, isTyping: e.target.value.length > 0 });
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedChat) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chat_id', selectedChat._id);

      console.log('📤 Uploading image:', file.name, file.size, 'bytes');

      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/media/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('✅ Upload response:', res.data);

      // Send message with media URL
      if (socket && res.data.url) {
        const messageData = {
          chat_id: selectedChat._id,
          content: file.name,
          media_url: res.data.url
        };
        console.log('📨 Sending message with media:', messageData);
        socket.emit('send-message', messageData);
      }
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      console.error('Error details:', error.response?.data);
      alert('Failed to upload image: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/chats/${chatId}`);
      setChats(chats.filter(chat => chat._id !== chatId));
      if (selectedChat?._id === chatId) {
        setSelectedChat(null);
        setMessages([]);
      }
      alert('Chat deleted successfully');
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('Failed to delete chat');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/chats/${selectedChat._id}/messages/${messageId}`);
      setMessages(messages.filter(msg => msg._id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message');
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusText.trim()) {
      alert('Please enter a status message');
      return;
    }

    try {
      await axios.put(`${API_URL}/api/users/status`, {
        status_message: statusText
      });
      setOpenStatusDialog(false);
      setStatusText('');
      alert('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleCreateChat = async () => {
    if (!newChatEmail.trim()) {
      alert('Please enter an email');
      return;
    }

    try {
      // First, search for user by email
      const searchRes = await axios.get(`${API_URL}/api/users/search?email=${newChatEmail}`);
      
      if (!searchRes.data.user) {
        alert('User not found with that email');
        return;
      }

      const otherUserId = searchRes.data.user._id;
      
      // Create chat with that user
      const res = await axios.post(`${API_URL}/api/chats`, {
        participant_ids: [otherUserId],
        is_group: false
      });
      
      const newChat = res.data.chat;
      setChats([newChat, ...chats]);
      setOpenNewChat(false);
      setNewChatEmail('');
      
      // Automatically select the new chat
      setSelectedChat(newChat);
      loadMessages(newChat._id);
      
    } catch (error) {
      console.error('Error creating chat:', error);
      alert(error.response?.data?.error || 'Failed to create chat. Make sure the email exists.');
    }
  };

  const getChatName = (chat) => {
    if (chat.is_group) return chat.group_name;
    const otherUser = chat.participants.find(p => p._id !== user.id);
    return otherUser ? otherUser.name : 'Unknown';
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ bgcolor: '#075E54', flexShrink: 0 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            WhatsApp Clone
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {currentUser?.name || user?.name}
          </Typography>
          <IconButton 
            color="inherit" 
            onClick={() => setOpenProfileSettings(true)} 
            sx={{ mr: 1, p: 0.5 }} 
            title="Profile Settings"
          >
            <Avatar 
              src={currentUser?.profile_image_url} 
              sx={{ width: 32, height: 32, bgcolor: '#25D366' }}
            >
              {(!currentUser?.profile_image_url && (currentUser?.name || user?.name)?.charAt(0).toUpperCase())}
            </Avatar>
          </IconButton>
          <IconButton color="inherit" onClick={handleOpenGroupDialog} sx={{ mr: 1 }} title="Create Group">
            <GroupsIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => navigate('/analytics')} sx={{ mr: 1 }}>
            <BarChartIcon />
          </IconButton>
          <IconButton color="inherit" onClick={logout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
        {/* Chat List Sidebar */}
        <Box sx={{ width: '30%', borderRight: '1px solid #d1d1d1', height: '100%', bgcolor: 'white', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, bgcolor: '#ededed', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #d1d1d1', flexShrink: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 500 }}>Chats</Typography>
              <IconButton 
                sx={{ 
                  bgcolor: '#25D366', 
                  color: 'white',
                  width: 40,
                  height: 40,
                  '&:hover': { bgcolor: '#20BA59' }
                }} 
                onClick={() => setOpenNewChat(true)}
              >
                <AddIcon />
              </IconButton>
            </Box>
            <List sx={{ overflow: 'auto', flexGrow: 1, p: 0 }}>
            {chats.length === 0 ? (
              <ListItem sx={{ py: 4, textAlign: 'center', display: 'block' }}>
                <Typography variant="body2" color="text.secondary">
                  No chats yet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Click + to start a new chat
                </Typography>
              </ListItem>
            ) : (
              chats.map((chat) => (
                <React.Fragment key={chat._id}>
                  <ListItemButton
                    selected={selectedChat?._id === chat._id}
                    onClick={() => handleChatSelect(chat)}
                    sx={{
                      py: 2,
                      '&.Mui-selected': {
                        bgcolor: '#f0f0f0'
                      },
                      '&:hover': {
                        bgcolor: '#f5f5f5'
                      }
                    }}
                  >
                    <ListItemAvatar>
                      <Box sx={{ position: 'relative' }}>
                        <Avatar 
                          src={!chat.is_group ? chat.participants.find(p => p._id !== user.id)?.profile_image_url : null}
                          sx={{ bgcolor: chat.is_group ? '#128C7E' : '#25D366', width: 50, height: 50 }}
                        >
                          {chat.is_group ? <GroupsIcon /> : getChatName(chat)[0].toUpperCase()}
                        </Avatar>
                        {!chat.is_group && (() => {
                          const otherUser = chat.participants.find(p => p._id !== user.id);
                          const isOnline = otherUser && onlineUsers[otherUser._id];
                          return isOnline && (
                            <Box
                              sx={{
                                position: 'absolute',
                                bottom: 2,
                                right: 2,
                                width: 12,
                                height: 12,
                                bgcolor: '#25D366',
                                border: '2px solid white',
                                borderRadius: '50%'
                              }}
                            />
                          );
                        })()}
                      </Box>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {getChatName(chat)}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          {chat.is_group ? (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {chat.participants.length} members
                            </Typography>
                          ) : (() => {
                            const otherUser = chat.participants.find(p => p._id !== user.id);
                            if (!otherUser) return null;
                            const isOnline = onlineUsers[otherUser._id];
                            const ls = lastSeen[otherUser._id];
                            return (
                              <Typography variant="caption" display="block" color={isOnline ? 'success.main' : 'text.secondary'}>
                                {isOnline ? 'Online' : ls ? `Last seen ${new Date(ls).toLocaleString()}` : 'Offline'}
                              </Typography>
                            );
                          })()}
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {chat.last_message?.content || 'No messages yet'}
                          </Typography>
                        </Box>
                      }
                    />
                    <IconButton 
                      edge="end" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(chat._id);
                      }}
                      sx={{ color: 'error.main' }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemButton>
                </React.Fragment>
              ))
            )}
          </List>
        </Box>

        {/* Chat Window */}
        <Box sx={{ width: '70%', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {selectedChat ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Chat Header */}
              <Paper elevation={1} square sx={{ p: 2, bgcolor: '#ededed', borderBottom: '1px solid #d1d1d1', flexShrink: 0, zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Avatar 
                    src={!selectedChat.is_group ? selectedChat.participants.find(p => p._id !== user.id)?.profile_image_url : null}
                    sx={{ bgcolor: selectedChat.is_group ? '#128C7E' : '#25D366', mr: 2 }}
                  >
                    {selectedChat.is_group ? <GroupsIcon /> : getChatName(selectedChat)[0].toUpperCase()}
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 500, fontSize: '16px' }}>
                      {getChatName(selectedChat)}
                    </Typography>
                    {selectedChat.is_group ? (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {selectedChat.participants.map(p => p.name).join(', ')}
                      </Typography>
                    ) : (() => {
                      const otherUser = selectedChat.participants.find(p => p._id !== user.id);
                      if (!otherUser) return null;
                      const isOnline = onlineUsers[otherUser._id];
                      const isTyping = typingUsers[otherUser._id];
                      const ls = lastSeen[otherUser._id];
                      
                      if (isTyping) {
                        return (
                          <Typography variant="caption" sx={{ color: 'success.main', fontStyle: 'italic' }}>
                            typing...
                          </Typography>
                        );
                      }
                      
                      return (
                        <Box>
                          <Typography variant="caption" sx={{ color: isOnline ? 'success.main' : 'text.secondary', display: 'block' }}>
                            {isOnline ? 'Online' : ls ? `Last seen ${new Date(ls).toLocaleString()}` : 'Offline'}
                          </Typography>
                          {otherUser.status_message && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', display: 'block' }}>
                              {otherUser.status_message}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </Box>
                </Box>
              </Paper>

              {/* Messages Area */}
              <Box sx={{ 
                flexGrow: 1, 
                overflow: 'auto', 
                p: 3, 
                bgcolor: '#efeae2',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d9d9d9' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0
              }}>
                {messages.map((msg, idx) => {
                  const isSent = msg.sender_id._id === user.id || msg.sender_id === user.id;
                  return (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        justifyContent: isSent ? 'flex-end' : 'flex-start',
                        mb: 1.5,
                        '&:hover .delete-btn': {
                          opacity: 1
                        }
                      }}
                    >
                      <Paper
                        elevation={1}
                        sx={{
                          p: 1.5,
                          maxWidth: '65%',
                          bgcolor: isSent ? '#DCF8C6' : '#fff',
                          borderRadius: isSent ? '10px 10px 0 10px' : '10px 10px 10px 0',
                          wordWrap: 'break-word',
                          position: 'relative'
                        }}
                      >
                        <IconButton
                          className="delete-btn"
                          size="small"
                          onClick={() => handleDeleteMessage(msg._id)}
                          sx={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            padding: '2px',
                            color: 'error.main'
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                        {!isSent && (
                          <Typography variant="caption" sx={{ fontWeight: 600, color: '#128C7E', display: 'block', mb: 0.5 }}>
                            {msg.sender_id.name}
                          </Typography>
                        )}
                        {msg.media_url && (
                          <Box sx={{ mb: 1 }}>
                            <img 
                              src={msg.media_url.startsWith('http') ? msg.media_url : `${API_URL}${msg.media_url}`} 
                              alt={msg.content}
                              style={{ 
                                maxWidth: '100%', 
                                borderRadius: '8px',
                                display: 'block'
                              }} 
                            />
                          </Box>
                        )}
                        <Typography variant="body1" sx={{ fontSize: '14px', lineHeight: 1.5 }}>
                          {msg.content}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.5 }}>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              color: isSent ? '#667781' : '#999',
                              fontSize: '11px'
                            }}
                          >
                            {formatTime(msg.timestamp)}
                          </Typography>
                          {getMessageStatusIcon(msg)}
                        </Box>
                      </Paper>
                    </Box>
                  );
                })}
                <div ref={messagesEndRef} />
              </Box>

              {/* Message Input */}
              <Box sx={{ p: 2, bgcolor: '#f0f0f0', display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <IconButton 
                  color="primary" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  sx={{ color: '#54656f' }}
                >
                  {uploading ? <CircularProgress size={24} /> : <ImageIcon />}
                </IconButton>
                <TextField
                  fullWidth
                  placeholder="Type a message"
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  size="small"
                  sx={{
                    bgcolor: 'white',
                    borderRadius: '20px',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '20px',
                      '& fieldset': {
                        borderColor: '#e0e0e0',
                      },
                    }
                  }}
                />
                <IconButton 
                  color="primary" 
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  sx={{ 
                    bgcolor: messageInput.trim() ? '#25D366' : '#b3b3b3',
                    color: 'white',
                    width: 48,
                    height: 48,
                    '&:hover': { 
                      bgcolor: messageInput.trim() ? '#20BA59' : '#b3b3b3'
                    },
                    '&:disabled': {
                      bgcolor: '#b3b3b3',
                      color: 'white'
                    }
                  }}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexDirection: 'column',
              height: '100%',
              bgcolor: '#222e35',
              backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              color: '#8696a0'
            }}>
              <Box sx={{ 
                width: 200, 
                height: 200, 
                borderRadius: '50%', 
                border: '5px solid rgba(134, 150, 160, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 4,
                bgcolor: 'rgba(134, 150, 160, 0.1)'
              }}>
                <Typography variant="h1" sx={{ fontSize: '80px', color: 'rgba(134, 150, 160, 0.5)' }}>
                  💬
                </Typography>
              </Box>
              <Typography variant="h5" sx={{ color: '#e9edef', mb: 1, fontWeight: 300 }}>
                WhatsApp Clone
              </Typography>
              <Typography variant="body1" sx={{ color: '#8696a0', textAlign: 'center', maxWidth: 400, px: 2 }}>
                Send and receive messages without keeping your phone online.
                <br />
                Select a chat to start messaging.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* New Chat Dialog */}
      <Dialog open={openNewChat} onClose={() => setOpenNewChat(false)}>
        <DialogTitle>New Chat</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="User Email"
            type="email"
            fullWidth
            value={newChatEmail}
            onChange={(e) => setNewChatEmail(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Note: For demo purposes, create a test chat to send messages
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewChat(false)}>Cancel</Button>
          <Button onClick={handleCreateChat} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={openStatusDialog} onClose={() => setOpenStatusDialog(false)}>
        <DialogTitle>Update WhatsApp Status</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Status Message"
            type="text"
            fullWidth
            multiline
            rows={3}
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            placeholder="What's on your mind?"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This will be visible to all your contacts
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStatusDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdateStatus} variant="contained" color="success">Update</Button>
        </DialogActions>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={openGroupDialog} onClose={() => setOpenGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            type="text"
            fullWidth
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Group Description (optional)"
            type="text"
            fullWidth
            multiline
            rows={2}
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            placeholder="What's this group about?"
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Add Members:
          </Typography>
          <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
            {allUsers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No users available
              </Typography>
            ) : (
              allUsers.map(u => (
                <FormControlLabel
                  key={u._id}
                  control={
                    <Checkbox
                      checked={selectedMembers.includes(u._id)}
                      onChange={() => handleMemberToggle(u._id)}
                      sx={{ '&.Mui-checked': { color: '#25D366' } }}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: '#25D366', width: 32, height: 32, mr: 1, fontSize: '14px' }}>
                        {u.name[0].toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ width: '100%', mb: 1, ml: 0 }}
                />
              ))
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Selected: {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenGroupDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateGroup} variant="contained" sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#20BA59' } }}>
            Create Group
          </Button>
        </DialogActions>
      </Dialog>

      {/* Profile Settings Dialog */}
      <ProfileSettings
        open={openProfileSettings}
        onClose={() => setOpenProfileSettings(false)}
        user={currentUser}
        onProfileUpdate={(updatedUser) => {
          setCurrentUser(updatedUser);
          // Update user in chats list
          setChats(prevChats =>
            prevChats.map(chat => ({
              ...chat,
              participants: chat.participants.map(p =>
                p._id === updatedUser._id ? { ...p, ...updatedUser } : p
              )
            }))
          );
        }}
      />
    </Box>
  );
}

export default ChatPage;
