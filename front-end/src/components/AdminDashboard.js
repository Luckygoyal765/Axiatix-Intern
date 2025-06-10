import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { jwtDecode } from 'jwt-decode';
import './css/login.css';

import { FaTachometerAlt, FaSignOutAlt } from 'react-icons/fa'; // Removed FaStethoscope

function AdminDashboard() {
    const [requests, setRequests] = useState([]);
    const [healthRecords, setHealthRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingHealth, setLoadingHealth] = useState(true);
    const [error, setError] = useState('');
    const [errorHealth, setErrorHealth] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [currentHealthPage, setCurrentHealthPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalHealthPages, setTotalHealthPages] = useState(1);
    const [totalRequests, setTotalRequests] = useState(0);
    const [totalHealthRecords, setTotalHealthRecords] = useState(0);
    const limit = 10; // Number of items per page
    const navigate = useNavigate();

    const fetchRequests = (page) => {
        setLoading(true);
        const token = localStorage.getItem('token');
        fetch(`http://localhost:3000/api/customer/all-can-sell-requests?page=${page}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error(
                            'Endpoint not found. Please ensure the /api/customer/all-can-sell-requests route is defined in server.js and the getAllCanSellRequests function exists in customer.js.'
                        );
                    }
                    throw new Error(`HTTP error! Status: ${res.status} ${res.statusText}`);
                }
                return res.json();
            })
            .then((data) => {
                console.log('Fetched requests:', data);
                setRequests(data.requests || []);
                setCurrentPage(data.currentPage || page);
                setTotalPages(data.totalPages || 1);
                setTotalRequests(data.totalRequests || 0);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Error fetching requests:', err.message);
                setError(`Failed to load requests: ${err.message}`);
                setLoading(false);
            });
    };

    const fetchHealthRecords = (page) => {
        setLoadingHealth(true);
        const token = localStorage.getItem('token');
        fetch(`http://localhost:3000/api/admin/goats/health?page=${page}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error(
                            'Endpoint not found. Please ensure the /api/admin/goats/health route is defined in server.js and the getAllHealthRecords function exists in goats.js.'
                        );
                    }
                    throw new Error(`HTTP error! Status: ${res.status} ${res.statusText}`);
                }
                return res.json();
            })
            .then((data) => {
                console.log('Fetched health records:', data);
                setHealthRecords(data.records || []);
                setCurrentHealthPage(data.currentPage || page);
                setTotalHealthPages(data.totalPages || 1);
                setTotalHealthRecords(data.totalRecords || 0);
                setLoadingHealth(false);
            })
            .catch((err) => {
                console.error('Error fetching health records:', err.message);
                setErrorHealth(`Failed to load health records: ${err.message}`);
                setLoadingHealth(false);
            });
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            Swal.fire({
                icon: 'error',
                title: 'Unauthorized',
                text: 'Please log in to access the dashboard.',
                confirmButtonColor: '#3085d6',
            }).then(() => navigate('/'));
            return;
        }

        let decodedToken;
        try {
            decodedToken = jwtDecode(token);
            console.log('Decoded Token:', decodedToken);
        } catch (err) {
            console.error('Token decode error:', err);
            localStorage.removeItem('token');
            Swal.fire({
                icon: 'error',
                title: 'Invalid Token',
                text: 'Your session is invalid. Please log in again.',
                confirmButtonColor: '#3085d6',
            }).then(() => navigate('/'));
            return;
        }

        const groupId = Number(decodedToken.group_id);
        if (groupId !== 0) {
            Swal.fire({
                icon: 'error',
                title: 'Unauthorized',
                text: 'Admins only (group_id = 0).',
                confirmButtonColor: '#3085d6',
            }).then(() => navigate('/'));
            return;
        }

        fetchRequests(currentPage);
        fetchHealthRecords(currentHealthPage);
    }, [navigate, currentPage, currentHealthPage]);

    // Inside AdminDashboard.js

    const handleRequestAction = (userId, action) => { // Changed requestId to userId for clarity
        const token = localStorage.getItem('token');

        let endpoint = '';
        let method = 'PUT'; // Use PUT for updating the status

        if (action === 'approve') {
            endpoint = `http://localhost:3000/api/admin/can-sell-requests/${userId}/approve`;
        } else if (action === 'reject') {
            endpoint = `http://localhost:3000/api/admin/can-sell-requests/${userId}/reject`;
        } else {
            console.error('Invalid action:', action);
            return; // Exit if action is neither 'approve' nor 'reject'
        }

        fetch(endpoint, {
            method: method, // This will be 'PUT'
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            // For PUT requests to these specific endpoints, you don't need a body
            // because the action (approve/reject) is conveyed by the URL itself.
            // body: JSON.stringify({ requestId: userId, action }), // Remove this line
        })
            .then(async (res) => { // Use async here to await json()
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ message: 'No error message from server.' })); // Try to parse error, but catch if not JSON
                    throw new Error(`HTTP error! Status: ${res.status}: ${errorData.message || res.statusText}`);
                }
                return res.json();
            })
            .then((data) => {
                Swal.fire({
                    icon: 'success',
                    title: 'Request Processed',
                    text: data.message || `Request has been ${action}d.`, // Use message from backend
                    confirmButtonColor: '#3085d6',
                });
                fetchRequests(currentPage); // Refresh the list
            })
            .catch((err) => {
                console.error('Error processing request:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Network Error',
                    text: `Failed to process request: ${err.message}`,
                    confirmButtonColor: '#3085d6',
                });
            });
    };

    const handleViewProfile = (userId) => {
        const token = localStorage.getItem('token');
        fetch(`http://localhost:3000/api/customer/profile/${userId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP error! Status: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                Swal.fire({
                    icon: 'info',
                    title: 'Customer Profile',
                    html: `
            <div style="text-align: left;">
              <p><strong>Username:</strong> ${data.username}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              <p><strong>Address:</strong> ${data.address || 'Not provided'}</p>
              <p><strong>Can Buy:</strong> ${data.can_buy ? 'Yes' : 'No'}</p>
              <p><strong>Can Sell:</strong> ${data.can_sell ? 'Yes' : 'No'}</p>
              <p><strong>Can Sell Status:</strong> ${data.can_sell_status || 'None'}</p>
              <p><strong>Verified:</strong> ${data.verified ? 'Yes' : 'No'}</p>
              ${data.photo ? `<img src="http://localhost:3000${data.photo}" alt="Profile Photo" style="max-width: 200px; margin-top: 10px;" />` : ''}
            </div>
          `,
                    confirmButtonColor: '#3085d6',
                });
            })
            .catch((err) => {
                console.error('Error fetching profile:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to fetch customer profile.',
                    confirmButtonColor: '#3085d6',
                });
            });
    };

    if (loading || loadingHealth) return <div className="text-center p-10 text-gray-600">Loading...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    if (errorHealth) return <div className="text-center p-10 text-red-500">{errorHealth}</div>;

    return (
        <div className="flex font-poppins min-h-screen bg-gradient-to-br from-gray-100 to-blue-50">
            <div className="w-64 bg-blue-900 text-white p-6 shadow-lg">
                <h3 className="text-2xl font-bold mb-8 tracking-wide">Digi Goat Admin</h3>
                <ul className="space-y-4">
                    <li>
                        <button
                            onClick={() => navigate('/admin-dashboard')}
                            className="flex items-center w-full text-left py-3 px-4 bg-blue-700 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                        >
                            <FaTachometerAlt className="mr-3" />
                            Dashboard
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => {
                                localStorage.removeItem('token');
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Logged Out',
                                    text: 'You have been logged out.',
                                    confirmButtonColor: '#3085d6',
                                }).then(() => navigate('/'));
                            }}
                            className="flex items-center w-full text-left py-3 px-4 hover:bg-blue-700 rounded-lg transition-colors duration-200"
                        >
                            <FaSignOutAlt className="mr-3" />
                            Logout
                        </button>
                    </li>
                </ul>
            </div>

            <div className="flex-1 p-8">
                <h2 className="text-4xl font-bold text-gray-800 mb-4">Admin Dashboard</h2>

                {/* Sell Requests Section */}
                <h3 className="text-2xl font-semibold text-gray-700 mb-8">Sell Requests</h3>
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-12">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">All Can Sell Requests</h3>
                    {requests.length === 0 ? (
                        <p className="text-gray-700">No requests found.</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-3 text-gray-700 font-semibold">User ID</th>
                                            <th className="p-3 text-gray-700 font-semibold">Username</th>
                                            <th className="p-3 text-gray-700 font-semibold">Email</th>
                                            <th className="p-3 text-gray-700 font-semibold">Requested At</th>
                                            <th className="p-3 text-gray-700 font-semibold">Status</th>
                                            <th className="p-3 text-gray-700 font-semibold">Actions</th>
                                            <th className="p-3 text-gray-700 font-semibold">Profile</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {requests.map((request) => (
                                            <tr key={request.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3">{request.user_id}</td>
                                                <td className="p-3">{request.username}</td>
                                                <td className="p-3">{request.email}</td>
                                                <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
                                                <td className="p-3">
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-sm ${request.status === 'approved'
                                                            ? 'bg-green-100 text-green-700'
                                                            : request.status === 'rejected'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                            }`}
                                                    >
                                                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="p-3 space-x-2">
                                                    {request.status === 'pending' ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleRequestAction(request.user_id, 'approve')}
                                                                className="bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition-colors duration-200"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleRequestAction(request.user_id, 'reject')}
                                                                className="bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition-colors duration-200"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-500">No action needed</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <button
                                                        onClick={() => handleViewProfile(request.user_id)}
                                                        className="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                                                    >
                                                        View Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <div className="text-gray-600">
                                    Showing {requests.length} of {totalRequests} requests
                                </div>
                                <div className="space-x-2">
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className={`px-4 py-2 rounded-lg ${currentPage === 1
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                            } transition-colors duration-200`}
                                    >
                                        Previous
                                    </button>
                                    <span className="text-gray-600">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className={`px-4 py-2 rounded-lg ${currentPage === totalPages
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                            } transition-colors duration-200`}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Health Records Section */}
                <h3 className="text-2xl font-semibold text-gray-700 mb-8">Goat Health Records</h3>
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">All Goat Health Records</h3>
                    {healthRecords.length === 0 ? (
                        <p className="text-gray-700">No health records found.</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-3 text-gray-700 font-semibold">Goat ID</th>
                                            <th className="p-3 text-gray-700 font-semibold">Goat Number</th>
                                            <th className="p-3 text-gray-700 font-semibold">Breed</th>
                                            <th className="p-3 text-gray-700 font-semibold">Date Checked</th>
                                            <th className="p-3 text-gray-700 font-semibold">Health Type</th>
                                            <th className="p-3 text-gray-700 font-semibold">Description</th>
                                            <th className="p-3 text-gray-700 font-semibold">Veterinarian</th>
                                            <th className="p-3 text-gray-700 font-semibold">Next Due Date</th>
                                            <th className="p-3 text-gray-700 font-semibold">Status</th>
                                            <th className="p-3 text-gray-700 font-semibold">Created At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {healthRecords.map((record) => (
                                            <tr key={record.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3">{record.goat_id}</td>
                                                <td className="p-3">{record.goat_number}</td>
                                                <td className="p-3">{record.breed}</td>
                                                <td className="p-3">{new Date(record.date_checked).toLocaleDateString()}</td>
                                                <td className="p-3">{record.health_type}</td>
                                                <td className="p-3">{record.description || 'N/A'}</td>
                                                <td className="p-3">{record.veterinarian || 'N/A'}</td>
                                                <td className="p-3">{record.next_due_date ? new Date(record.next_due_date).toLocaleDateString() : 'N/A'}</td>
                                                <td className="p-3">
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-sm ${record.status === 'Healthy'
                                                            ? 'bg-green-100 text-green-700'
                                                            : record.status === 'Needs Attention'
                                                                ? 'bg-yellow-100 text-yellow-700'
                                                                : 'bg-red-100 text-red-700'
                                                            }`}
                                                    >
                                                        {record.status}
                                                    </span>
                                                </td>
                                                <td className="p-3">{new Date(record.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <div className="text-gray-600">
                                    Showing {healthRecords.length} of {totalHealthRecords} health records
                                </div>
                                <div className="space-x-2">
                                    <button
                                        onClick={() => setCurrentHealthPage((prev) => Math.max(prev - 1, 1))}
                                        disabled={currentHealthPage === 1}
                                        className={`px-4 py-2 rounded-lg ${currentHealthPage === 1
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                            } transition-colors duration-200`}
                                    >
                                        Previous
                                    </button>
                                    <span className="text-gray-600">
                                        Page {currentHealthPage} of {totalHealthPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentHealthPage((prev) => Math.min(prev + 1, totalHealthPages))}
                                        disabled={currentHealthPage === totalHealthPages}
                                        className={`px-4 py-2 rounded-lg ${currentHealthPage === totalHealthPages
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                            } transition-colors duration-200`}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AdminDashboard;