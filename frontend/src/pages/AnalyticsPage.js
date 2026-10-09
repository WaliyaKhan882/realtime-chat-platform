import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  AppBar,
  Toolbar,
  IconButton,
  CircularProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const API_URL = 'http://localhost:3000';

function AnalyticsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overallStats, setOverallStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [hourlyStats, setHourlyStats] = useState([]);
  const [topUsers, setTopUsers] = useState([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Fetch all analytics data
      const [overallRes, dailyRes, hourlyRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/api/analytics/overall`, { headers }),
        axios.get(`${API_URL}/api/analytics/daily?days=7`, { headers }),
        axios.get(`${API_URL}/api/analytics/hourly`, { headers }),
        axios.get(`${API_URL}/api/analytics/top-users?limit=5`, { headers })
      ]);

      console.log('Analytics data loaded:', {
        overall: overallRes.data,
        daily: dailyRes.data,
        hourly: hourlyRes.data,
        users: usersRes.data
      });

      setOverallStats(overallRes.data.stats);
      setDailyStats(dailyRes.data.stats);
      setHourlyStats(hourlyRes.data.distribution);
      setTopUsers(usersRes.data.users);

    } catch (error) {
      console.error('Error loading analytics:', error);
      console.error('Error response:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  // Prepare daily chart data (last 7 days)
  const dailyChartData = {
    labels: dailyStats.map(stat => {
      const date = new Date(stat.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).reverse(),
    datasets: [
      {
        label: 'Messages per Day',
        data: dailyStats.map(stat => parseInt(stat.message_count || 0)).reverse(),
        borderColor: '#25D366',
        backgroundColor: 'rgba(37, 211, 102, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  // Prepare hourly chart data (today)
  const hourlyChartData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: 'Messages by Hour',
        data: Array.from({ length: 24 }, (_, hour) => {
          const stat = hourlyStats.find(s => s.hour === hour);
          return stat ? parseInt(stat.message_count || 0) : 0;
        }),
        backgroundColor: '#128C7E',
        borderColor: '#075E54',
        borderWidth: 1
      }
    ]
  };

  // Prepare user distribution pie chart
  const userChartData = {
    labels: topUsers.map((_, idx) => `User ${idx + 1}`),
    datasets: [
      {
        label: 'Messages',
        data: topUsers.map(u => parseInt(u.message_count || 0)),
        backgroundColor: [
          '#25D366',
          '#128C7E',
          '#075E54',
          '#34B7F1',
          '#ECE5DD'
        ],
        borderColor: '#fff',
        borderWidth: 2
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top'
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f0f2f5' }}>
      <AppBar position="static" sx={{ bgcolor: '#075E54' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate('/chat')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ ml: 2 }}>
            Analytics Dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        {/* Overview Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Messages
                </Typography>
                <Typography variant="h4" sx={{ color: '#25D366', fontWeight: 'bold' }}>
                  {overallStats?.total_messages?.toLocaleString() || '0'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Messages Today
                </Typography>
                <Typography variant="h4" sx={{ color: '#128C7E', fontWeight: 'bold' }}>
                  {overallStats?.messages_today?.toLocaleString() || '0'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Peak Hour
                </Typography>
                <Typography variant="h4" sx={{ color: '#34B7F1', fontWeight: 'bold' }}>
                  {overallStats?.peak_hour !== null && overallStats?.peak_hour !== undefined
                    ? `${overallStats.peak_hour}:00`
                    : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Charts */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography variant="h6" gutterBottom>
                Messages Over Time (Last 7 Days)
              </Typography>
              <Box sx={{ height: 320 }}>
                <Line data={dailyChartData} options={chartOptions} />
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography variant="h6" gutterBottom>
                Top Users (Today)
              </Typography>
              <Box sx={{ height: 320 }}>
                <Pie data={userChartData} options={chartOptions} />
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography variant="h6" gutterBottom>
                Hourly Distribution (Today)
              </Typography>
              <Box sx={{ height: 320 }}>
                <Bar data={hourlyChartData} options={chartOptions} />
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default AnalyticsPage;
