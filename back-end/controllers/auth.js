const db = require('../config/db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

let otpStore = {};
let otpRequestTracker = {};
let activeSessions = {};
let passwordResetTokens = {}; // Store for password reset tokens

const OTP_REQUEST_LIMIT = 3;
const OTP_WINDOW_MS = 60 * 1000;
const RESET_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes

// Ensure JWT_SECRET is set
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in environment variables');
}

// Fix: Change createTransporter to createTransport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'registerdigigoat14@gmail.com',
    pass: process.env.EMAIL_PASS || 'zsubdvcofcqkdlpb',
  },
});

const sendOtp = (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('DB error in sendOtp:', err);
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (results.length > 0) return res.status(400).json({ message: 'Email already registered' });

    const now = Date.now();
    const tracker = otpRequestTracker[email];

    if (tracker) {
      if (now - tracker.firstRequestTime < OTP_WINDOW_MS) {
        if (tracker.count >= OTP_REQUEST_LIMIT) {
          const waitTime = Math.ceil((OTP_WINDOW_MS - (now - tracker.firstRequestTime)) / 1000);
          return res.status(429).json({ message: 'Too many OTP requests', waitTime });
        }
        tracker.count++;
      } else {
        otpRequestTracker[email] = { count: 1, firstRequestTime: now };
      }
    } else {
      otpRequestTracker[email] = { count: 1, firstRequestTime: now };
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    otpStore[email] = { otp, expiresAt: now + 2 * 60 * 1000, verified: false };

    setTimeout(() => delete otpStore[email], 5 * 60 * 1000);
    setTimeout(() => delete otpRequestTracker[email], OTP_WINDOW_MS);

    const mailOptions = {
      from: `"Digi Goat Team" <${process.env.EMAIL_USER || 'registerdigigoat@gmail.com'}>`,
      to: email,
      subject: 'Digi Goat: Your OTP for Registration',
      text: `Dear User,\n\nYour OTP for registration is: ${otp}\n\nThis OTP is valid for 2 minutes. Do not share this code with anyone.\n\nBest regards,\nThe Digi Goat Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1d4ed8;">Digi Goat Registration</h2>
          <p>Dear User,</p>
          <p>Your OTP for registration is:</p>
          <h3 style="color: #1d4ed8; font-size: 24px; margin: 10px 0;">${otp}</h3>
          <p>This OTP is valid for 2 minutes. Please do not share this code with anyone.</p>
          <p>If you did not request this OTP, please ignore this email.</p>
          <p>Best regards,<br>The Digi Goat Team</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">
            This email was sent by Digi Goat. If you have any questions, please contact us at support@digigoat.com.
          </p>
        </div>
      `,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('Error sending OTP email:', error);
        return res.status(500).json({ message: 'Failed to send OTP', error: error.message });
      }
      res.status(200).json({ message: 'OTP sent successfully' });
    });
  });
};

const verifyOtp = (req, res) => {
  const { email, otp } = req.body;
  const otpData = otpStore[email];
  if (otpData && otpData.otp === otp && Date.now() <= otpData.expiresAt) {
    otpStore[email].verified = true;
    res.status(200).json({ message: 'OTP verified' });
  } else {
    res.status(400).json({ message: 'Invalid or expired OTP' });
  }
};

const register = (req, res) => {
  const { name, phone_number, email, password, confirmPassword, group_id } = req.body;

  if (!name || !phone_number || !email || !password || !confirmPassword || group_id === undefined) {
    return res.status(400).json({ message: 'Please fill all fields' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  const parsedGroupId = Number(group_id);
  if (isNaN(parsedGroupId) || (parsedGroupId !== 0 && parsedGroupId !== 1)) {
    return res.status(400).json({ message: 'Invalid group_id. Must be 0 (Admin) or 1 (User)' });
  }

  if (!otpStore[email] || !otpStore[email].verified) {
    return res.status(403).json({ message: 'OTP not verified. Please verify your email.' });
  }

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('DB error in register:', err);
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (results.length > 0) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      `INSERT INTO users (username, email, password, group_id, phone_number, verified, active) 
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [name, email, hashedPassword, parsedGroupId, phone_number],
      (err) => {
        if (err) {
          console.error('DB error in register:', err);
          return res.status(500).json({ message: 'Failed to register user', error: err.message });
        }
        delete otpStore[email];
        res.status(201).json({ message: 'User registered successfully. Please log in.' });
      }
    );
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const clientIp = req.ip;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('DB error in login:', err);
      return res.status(500).json({ message: 'Database error', error: err.message });
    }
    if (results.length === 0) return res.status(401).json({ message: 'Invalid email or password' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    if (user.verified !== 1) {
      return res.status(403).json({ message: 'Email not verified. Please verify.' });
    }

    if (user.active !== 1) {
      return res.status(403).json({ message: 'Account is inactive. Contact admin.' });
    }

    const sessionId = uuidv4();
    const token = jwt.sign(
      { userId: user.id, sessionId, clientIp, group_id: Number(user.group_id) },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    activeSessions[user.id] = {
      sessionId,
      clientIp,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };

    res.status(200).json({
      message: 'Login successful',
      token,
      username: user.username,
      group_id: user.group_id,
      verified: user.verified,
      active: user.active,
    });
  });
};

// NEW: Forgot Password Request
const forgotPasswordRequest = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Check if user exists and is verified
  db.query('SELECT * FROM users WHERE email = ? AND verified = 1', [email], (err, results) => {
    if (err) {
      console.error('DB error in forgotPasswordRequest:', err);
      return res.status(500).json({ message: 'Database error', error: err.message });
    }

    if (results.length === 0) {
      // For security, don't reveal if email exists or not
      return res.status(200).json({
        message: 'If the email exists in our system, you will receive a password reset link.'
      });
    }

    const user = results[0];

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + RESET_TOKEN_EXPIRY;

    // Store reset token
    passwordResetTokens[email] = {
      token: resetToken,
      userId: user.id,
      expiresAt: resetTokenExpiry
    };

    // Clean up expired tokens after 20 minutes
    setTimeout(() => {
      delete passwordResetTokens[email];
    }, 20 * 60 * 1000);

    // Create reset link
    const resetLink = `http://localhost:3001/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
      from: `"Digi Goat Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Digi Goat: Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1d4ed8;">Password Reset Request</h2>
          <p>Dear ${user.username},</p>
          <p>We received a request to reset your password for your Digi Goat account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #1d4ed8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #1d4ed8;">${resetLink}</p>
          <p><strong>This link will expire in 15 minutes.</strong></p>
          <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
          <p>Best regards,<br>The Digi Goat Team</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">
            For security reasons, this email was sent to verify your identity. If you have any questions, please contact us at support@digigoat.com.
          </p>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('Error sending password reset email:', error);
        return res.status(500).json({ message: 'Failed to send password reset email' });
      }

      res.status(200).json({
        message: 'If the email exists in our system, you will receive a password reset link.'
      });
    });
  });
};

// NEW: Verify Reset Token
const verifyResetToken = (req, res) => {
  const { token, email } = req.query;

  if (!token || !email) {
    return res.status(400).json({ message: 'Token and email are required' });
  }

  const resetData = passwordResetTokens[email];

  if (!resetData || resetData.token !== token || Date.now() > resetData.expiresAt) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }

  res.status(200).json({ message: 'Token is valid', email });
};

// NEW: Reset Password
const resetPassword = (req, res) => {
  const { token, email, newPassword, confirmPassword } = req.body;

  if (!token || !email || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  const resetData = passwordResetTokens[email];

  if (!resetData || resetData.token !== token || Date.now() > resetData.expiresAt) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }

  // Hash new password
  bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
    if (hashErr) {
      console.error('Error hashing password:', hashErr);
      return res.status(500).json({ message: 'Error processing password' });
    }

    // Update password in database
    db.query(
      'UPDATE users SET password = ? WHERE id = ? AND email = ?',
      [hashedPassword, resetData.userId, email],
      (err, result) => {
        if (err) {
          console.error('DB error in resetPassword:', err);
          return res.status(500).json({ message: 'Database error', error: err.message });
        }

        if (result.affectedRows === 0) {
          return res.status(400).json({ message: 'User not found' });
        }

        // Clean up the reset token
        delete passwordResetTokens[email];

        // Invalidate all active sessions for this user
        delete activeSessions[resetData.userId];

        res.status(200).json({ message: 'Password reset successfully' });
      }
    );
  });
};

const logout = (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const sessionId = decoded.sessionId;

    if (activeSessions[userId]?.sessionId === sessionId) {
      delete activeSessions[userId];
      return res.status(200).json({ message: 'Logout successful' });
    }
    return res.status(401).json({ message: 'Invalid or expired session' });
  } catch (err) {
    console.error('Error in logout:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const validateSession = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    if (
      activeSessions[userId] &&
      activeSessions[userId].sessionId === decoded.sessionId &&
      activeSessions[userId].clientIp === req.ip &&
      activeSessions[userId].expiresAt > Date.now()
    ) {
      db.query('SELECT active FROM users WHERE id = ?', [userId], (err, results) => {
        if (err) {
          console.error('DB error in validateSession:', err);
          return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (results.length === 0 || results[0].active !== 1) {
          delete activeSessions[userId];
          return res.status(403).json({ message: 'User account is inactive or deleted' });
        }
        req.user = decoded;
        next();
      });
    } else {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }
  } catch (err) {
    console.error('Error in validateSession:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.group_id !== 0) {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
};

const isCustomer = (req, res, next) => {
  if (req.user.group_id !== 1) {
    return res.status(403).json({ message: 'Access denied. Customers only.' });
  }
  next();
};

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  logout,
  validateSession,
  isAdmin,
  isCustomer,
  forgotPasswordRequest,
  verifyResetToken,
  resetPassword,
};