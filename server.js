const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:5500' })); // Adjust to your frontend port
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

pool.connect((err) => {
    if (err) {
        console.error('Database connection error:', err.stack);
        process.exit(1);
    }
    console.log('Connected to PostgreSQL');
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Serve static pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/profile', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/community', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'public', 'community.html')));
app.get('/dashboard', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Admin Registration
app.post('/admin/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'All fields required' });
    const admin_id = uuidv4().substring(0, 255);
    const pass = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO Admin (admin_id, username, pass) VALUES ($1, $2, $3)', [admin_id, username, pass]);
        res.status(201).json({ admin_id });
    } catch (err) {
        console.error('Admin registration error:', err.stack);
        res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
});

// Admin Login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM Admin WHERE username = $1', [username]);
        if (result.rows.length && await bcrypt.compare(password, result.rows[0].pass)) {
            const token = jwt.sign({ admin_id: result.rows[0].admin_id }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Admin login error:', err.stack);
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// User Registration
app.post('/register', async (req, res) => {
    const { name, email, password, location, phone_no } = req.body;
    console.log('Register request:', req.body);
    if (!name || !email || !password || !location || !phone_no) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const user_id = uuidv4().substring(0, 255);
    const passwordHash = await bcrypt.hash(password, 10);
    const time_credits = 0;
    try {
        await pool.query(
            'INSERT INTO Users (user_id, name, email, password, location, phone_no, time_credits) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [user_id, name, email, passwordHash, location, phone_no, time_credits]
        );
        res.status(201).json({ user_id });
    } catch (err) {
        console.error('User registration error:', err.stack);
        if (err.code === '23505') {
            res.status(409).json({ error: 'Email already registered' });
        } else {
            res.status(500).json({ error: 'Registration failed: ' + err.message });
        }
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('Login request:', { email });
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    try {
        const result = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (result.rows.length && await bcrypt.compare(password, result.rows[0].password)) {
            const token = jwt.sign({ user_id: result.rows[0].user_id }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ user_id: result.rows[0].user_id, token, name: result.rows[0].name });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('User login error:', err.stack);
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// Get Skills
app.get('/skills', async (req, res) => {
    try {
        const result = await pool.query('SELECT s.*, u.name as provider_name FROM Skills s JOIN Users u ON s.user_id = u.user_id WHERE s.is_active = TRUE');
        res.json(result.rows);
    } catch (err) {
        console.error('Get skills error:', err.stack);
        res.status(500).json({ error: 'Error fetching skills: ' + err.message });
    }
});

// Add Skill
app.post('/skills', authenticateToken, async (req, res) => {
    const { user_id, skill_name, hourly_rate, description, availability } = req.body;
    console.log('POST /skills request:', req.body);
    if (!user_id || !skill_name || !hourly_rate || !availability) {
        return res.status(400).json({ error: 'All fields (user_id, skill_name, hourly_rate, availability) are required' });
    }
    if (isNaN(hourly_rate) || hourly_rate <= 0) {
        return res.status(400).json({ error: 'Hourly rate must be a positive number' });
    }
    if (req.user.user_id !== user_id) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const skill_id = uuidv4().substring(0, 255);
    try {
        const userCheck = await pool.query('SELECT user_id FROM Users WHERE user_id = $1', [user_id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        await pool.query(
            'INSERT INTO Skills (skill_id, user_id, skill_name, hourly_rate, description, availability, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [skill_id, user_id, skill_name, Number(hourly_rate), description || null, availability, true]
        );
        res.status(201).json({ skill_id });
    } catch (err) {
        console.error('Add skill error:', err.stack);
        res.status(500).json({ error: 'Error adding skill: ' + err.message });
    }
});

// Update Skill
app.put('/skills/:id', authenticateToken, async (req, res) => {
    const skillId = req.params.id;
    const { skill_name, hourly_rate, description, availability } = req.body;
    console.log('PUT /skills/:id request:', req.body);
    if (!skill_name || !hourly_rate || !availability) {
        return res.status(400).json({ error: 'All fields (skill_name, hourly_rate, availability) are required' });
    }
    if (isNaN(hourly_rate) || hourly_rate <= 0) {
        return res.status(400).json({ error: 'Hourly rate must be a positive number' });
    }
    try {
        const result = await pool.query(
            '@jit_update_skills',
            [skill_name, Number(hourly_rate), description || null, availability, skillId, req.user.user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Skill not found or unauthorized' });
        }
        res.json({ message: 'Skill updated successfully' });
    } catch (err) {
        console.error('Update skill error:', err.stack);
        res.status(500).json({ error: 'Error updating skill: ' + err.message });
    }
});

// Archive Skill
app.delete('/skills/:id', authenticateToken, async (req, res) => {
    const skillId = req.params.id;
    console.log('DELETE /skills/:id:', skillId);
    try {
        const result = await pool.query(
            'UPDATE Skills SET is_active = FALSE WHERE skill_id = $1 AND user_id = $2 RETURNING *',
            [skillId, req.user.user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Skill not found or unauthorized' });
        }
        res.json({ message: 'Skill archived successfully' });
    } catch (err) {
        console.error('Archive skill error:', err.stack);
        res.status(500).json({ error: 'Error archiving skill: ' + err.message });
    }
});

// Create Transaction
app.post('/transactions', authenticateToken, async (req, res) => {
    console.log('POST /transactions request:', req.body);
    const { provider_id, receiver_id, skill_id, hours_transferred } = req.body;
    if (!provider_id || !receiver_id || !skill_id || !hours_transferred) {
        return res.status(400).json({ error: 'All fields (provider_id, receiver_id, skill_id, hours_transferred) are required' });
    }
    if (req.user.user_id !== receiver_id) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const transaction_id = uuidv4().substring(0, 255);
    try {
        const skillCheck = await pool.query('SELECT user_id, skill_name FROM Skills WHERE skill_id = $1 AND is_active = TRUE', [skill_id]);
        if (skillCheck.rows.length === 0 || skillCheck.rows[0].user_id !== provider_id) {
            return res.status(404).json({ error: 'Skill not found, inactive, or does not belong to provider' });
        }

        const userCheck = await pool.query('SELECT user_id FROM Users WHERE user_id IN ($1, $2)', [provider_id, receiver_id]);
        if (userCheck.rows.length < 2) {
            return res.status(404).json({ error: 'Provider or receiver not found' });
        }

        await pool.query(
            'INSERT INTO Transactions (transaction_id, provider_id, receiver_id, skill_id, hours_transferred, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [transaction_id, provider_id, receiver_id, skill_id, hours_transferred, 'Pending']
        );

        const skillName = skillCheck.rows[0].skill_name;
        const receiver = await pool.query('SELECT name FROM Users WHERE user_id = $1', [receiver_id]);
        const message = `${receiver.rows[0].name} requested ${skillName} from you for ${hours_transferred} hour(s)`;
        const notification_id = uuidv4().substring(0, 255);
        try {
            await pool.query(
                'INSERT INTO Notifications (notification_id, user_id, transaction_id, message, is_read, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [notification_id, provider_id, transaction_id, message, false, 'Pending']
            );
        } catch (notificationErr) {
            console.error('Failed to insert notification:', notificationErr.stack);
        }

        res.status(201).json({ transaction_id });
    } catch (err) {
        console.error('Transaction creation error:', err.stack);
        res.status(500).json({ error: 'Error creating transaction: ' + err.message });
    }
});

// Update Transaction
app.put('/transactions/:id', authenticateToken, async (req, res) => {
    const transactionId = req.params.id;
    const { status } = req.body;
    console.log('PUT /transactions/:id:', { transactionId, status });
    if (!status || !['Pending', 'Completed', 'Cancelled', 'Accepted', 'Declined'].includes(status)) {
        return res.status(400).json({ error: 'Valid status required' });
    }
    try {
        const result = await pool.query(
            'UPDATE Transactions SET status = $1 WHERE transaction_id = $2 AND (provider_id = $3 OR receiver_id = $3) RETURNING *',
            [status, transactionId, req.user.user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found or unauthorized' });
        }
        res.json({ message: 'Transaction updated successfully' });
    } catch (err) {
        console.error('Update transaction error:', err.stack);
        res.status(500).json({ error: 'Error updating transaction: ' + err.message });
    }
});

// Add Review
app.post('/reviews', authenticateToken, async (req, res) => {
    const { user_id, transaction_id, comments, rating } = req.body;
    console.log('POST /reviews:', req.body);
    if (!user_id || !transaction_id || !comments || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid review data' });
    }
    if (req.user.user_id !== user_id) return res.status(403).json({ error: 'Unauthorized' });
    const review_id = uuidv4().substring(0, 255);
    try {
        await pool.query(
            'INSERT INTO Reviews (review_id, transaction_id, comments, rating) VALUES ($1, $2, $3, $4)',
            [review_id, transaction_id, comments, rating]
        );
        res.status(201).json({ review_id });
    } catch (err) {
        console.error('Add review error:', err.stack);
        res.status(500).json({ error: 'Error adding review: ' + err.message });
    }
});

// Get User Data
app.get('/user/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    console.log('GET /user/:id:', userId);
    if (req.user.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const user = await pool.query('SELECT * FROM Users WHERE user_id = $1', [userId]);
        const skills = await pool.query('SELECT * FROM Skills WHERE user_id = $1 AND is_active = TRUE', [userId]);
        const sentTransactions = await pool.query(
            `SELECT t.*, up.name as provider_name, ur.name as receiver_name, s.skill_name
             FROM Transactions t
             JOIN Users up ON t.provider_id = up.user_id
             JOIN Users ur ON t.receiver_id = ur.user_id
             JOIN Skills s ON t.skill_id = s.skill_id
             WHERE t.receiver_id = $1`,
            [userId]
        );
        const receivedNotifications = await pool.query(
            `SELECT n.*, t.hours_transferred, s.skill_name, u.name as sender_name
             FROM Notifications n
             JOIN Transactions t ON n.transaction_id = t.transaction_id
             JOIN Skills s ON t.skill_id = s.skill_id
             JOIN Users u ON t.receiver_id = u.user_id
             WHERE n.user_id = $1
             ORDER BY n.created_at DESC`,
            [userId]
        );
        res.json({
            ...user.rows[0],
            name: user.rows[0].name,
            skills: skills.rows,
            sentTransactions: sentTransactions.rows,
            receivedNotifications: receivedNotifications.rows
        });
    } catch (err) {
        console.error('Get user error:', err.stack);
        res.status(500).json({ error: 'Error fetching user data: ' + err.message });
    }
});

// Update User Profile
app.put('/user/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    const { name, email, location, phone_no, password } = req.body;
    console.log('PUT /user/:id:', req.body);
    if (req.user.user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });
    try {
        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }
        const updateFields = [];
        const values = [];
        let index = 1;

        if (name) { updateFields.push(`name = $${index++}`); values.push(name); }
        if (email) { updateFields.push(`email = $${index++}`); values.push(email); }
        if (location) { updateFields.push(`location = $${index++}`); values.push(location); }
        if (phone_no) { updateFields.push(`phone_no = $${index++}`); values.push(phone_no); }
        if (passwordHash) { updateFields.push(`password = $${index++}`); values.push(passwordHash); }

        if (updateFields.length > 0) {
            values.push(userId);
            await pool.query(
                `UPDATE Users SET ${updateFields.join(', ')} WHERE user_id = $${index}`,
                values
            );
        }
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Update user error:', err.stack);
        res.status(500).json({ error: 'Error updating profile: ' + err.message });
    }
});

// Match Skills
app.post('/match-skills', authenticateToken, async (req, res) => {
    const { user_id, skill_needed, preferred_location } = req.body;
    console.log('POST /match-skills:', req.body);
    if (!user_id || !skill_needed || !preferred_location) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (req.user.user_id !== user_id) return res.status(403).json({ error: 'Unauthorized' });
    try {
        const result = await pool.query(
            `SELECT s.*, u.name as provider_name 
             FROM Skills s 
             JOIN Users u ON s.user_id = u.user_id 
             WHERE s.skill_name ILIKE $1 
             AND u.location ILIKE $2 
             AND s.user_id != $3 
             AND s.is_active = TRUE`,
            [`%${skill_needed}%`, `%${preferred_location}%`, user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Match skills error:', err.stack);
        res.status(500).json({ error: 'Error matching skills: ' + err.message });
    }
});

// Community Stats
app.get('/community/stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM Users');
        const totalTransactions = await pool.query('SELECT COUNT(*) FROM Transactions');
        const topContributors = await pool.query(
            `SELECT u.name, COUNT(t.transaction_id) as transactions 
             FROM Users u 
             LEFT JOIN Transactions t ON u.user_id = t.provider_id 
             GROUP BY u.user_id, u.name 
             ORDER BY transactions DESC 
             LIMIT 5`
        );
        const recentTransactions = await pool.query(
            `SELECT t.*, up.name as provider_name, ur.name as receiver_name, s.skill_name 
             FROM Transactions t 
             JOIN Users up ON t.provider_id = up.user_id 
             JOIN Users ur ON t.receiver_id = ur.user_id 
             JOIN Skills s ON t.skill_id = s.skill_id 
             ORDER BY t.transaction_id DESC 
             LIMIT 10`
        );
        res.json({
            totalUsers: totalUsers.rows[0].count,
            totalTransactions: totalTransactions.rows[0].count,
            topContributors: topContributors.rows,
            recentTransactions: recentTransactions.rows
        });
    } catch (err) {
        console.error('Community stats error:', err.stack);
        res.status(500).json({ error: 'Error fetching community stats: ' + err.message });
    }
});

// Get Notifications
app.get('/notifications', authenticateToken, async (req, res) => {
    console.log('GET /notifications for user:', req.user.user_id);
    try {
        const result = await pool.query(
            'SELECT * FROM Notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get notifications error:', err.stack);
        res.status(500).json({ error: 'Error fetching notifications: ' + err.message });
    }
});

// Mark Notification as Read
app.put('/notifications/:id', authenticateToken, async (req, res) => {
    const notificationId = req.params.id;
    console.log('PUT /notifications/:id:', notificationId);
    try {
        const result = await pool.query(
            'UPDATE Notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2 RETURNING *',
            [notificationId, req.user.user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found or unauthorized' });
        }
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error('Update notification error:', err.stack);
        res.status(500).json({ error: 'Error updating notification: ' + err.message });
    }
});

// Accept Notification
app.put('/notifications/:id/accept', authenticateToken, async (req, res) => {
    const notificationId = req.params.id;
    console.log('PUT /notifications/:id/accept:', notificationId);
    try {
        const result = await pool.query(
            'UPDATE Notifications SET status = $1, is_read = TRUE WHERE notification_id = $2 AND user_id = $3 AND status = $4 RETURNING *',
            ['Accepted', notificationId, req.user.user_id, 'Pending']
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found, already handled, or unauthorized' });
        }
        const transactionId = result.rows[0].transaction_id;
        await pool.query(
            'UPDATE Transactions SET status = $1 WHERE transaction_id = $2',
            ['Accepted', transactionId]
        );
        res.json({ message: 'Request accepted' });
    } catch (err) {
        console.error('Accept notification error:', err.stack);
        res.status(500).json({ error: 'Error accepting request: ' + err.message });
    }
});

// Decline Notification
app.put('/notifications/:id/decline', authenticateToken, async (req, res) => {
    const notificationId = req.params.id;
    console.log('PUT /notifications/:id/decline:', notificationId);
    try {
        const result = await pool.query(
            'UPDATE Notifications SET status = $1, is_read = TRUE WHERE notification_id = $2 AND user_id = $3 AND status = $4 RETURNING *',
            ['Declined', notificationId, req.user.user_id, 'Pending']
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found, already handled, or unauthorized' });
        }
        const transactionId = result.rows[0].transaction_id;
        await pool.query(
            'UPDATE Transactions SET status = $1 WHERE transaction_id = $2',
            ['Declined', transactionId]
        );
        res.json({ message: 'Request declined' });
    } catch (err) {
        console.error('Decline notification error:', err.stack);
        res.status(500).json({ error: 'Error declining request: ' + err.message });
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));