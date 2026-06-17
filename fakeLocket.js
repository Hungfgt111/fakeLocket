
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Cấu hình Middleware
// Bật CORS để cho phép Frontend gọi API mà không bị chặn
app.use(cors());
// Tăng giới hạn dung lượng lên 50MB vì ảnh chuyển sang chuỗi Base64 sẽ rất nặng
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Cấu hình để phục vụ file tĩnh (Frontend: index.html) 
// Khi truy cập http://localhost:3000 nó sẽ tự đọc file index.html cùng thư mục


// ==========================================
// CƠ SỞ DỮ LIỆU TỆP TIN (FILE-BASED DATABASE)
// ==========================================
const dbPath = path.join(__dirname, 'db.json');
let db = { users: {}, posts: [], friendRequests: [] };

if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        console.error("Lỗi đọc db.json, khởi tạo database trống:", e);
    }
}

let users = db.users || {};
let posts = db.posts || [];
let friendRequests = db.friendRequests || [];

function saveDb() {
    try {
        db.users = users;
        db.posts = posts;
        db.friendRequests = friendRequests;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 4), 'utf8');
    } catch (e) {
        console.error("Lỗi lưu file db.json:", e);
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Lấy danh sách bài đăng (Lọc theo bạn bè)
app.get('/api/posts', (req, res) => {
    const { username } = req.query;

    let allowedAuthors = [username]; // Luôn thấy bài của chính mình
    if (username && users[username]) {
        allowedAuthors = allowedAuthors.concat(users[username].friends);
    }

    // Lọc bài viết
    const filteredPosts = posts.filter(p => allowedAuthors.includes(p.author));
    // Sắp xếp bài đăng mới nhất lên đầu tiên
    const sortedPosts = filteredPosts.sort((a, b) => b.timestamp - a.timestamp);

    res.json({ success: true, data: sortedPosts });
});

// 2. Đăng một khoảnh khắc mới (POST /api/posts)
app.post('/api/posts', (req, res) => {
    const { image, caption, author } = req.body;

    if (!image) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ảnh!' });
    }

    const newPost = {
        id: Date.now().toString(),
        author: author || 'Ẩn danh', // Lưu người đăng
        image: image,
        caption: caption || '',
        hearts: 0,
        comments: [],
        timestamp: Date.now()
    };

    posts.push(newPost);
    saveDb();
    console.log(`[+] [${newPost.author}] đăng bài mới: ID ${newPost.id}`);
    res.json({ success: true, message: 'Đăng khoảnh khắc thành công!', post: newPost });
});

// 3. Thả tim bài viết (POST /api/posts/:id/heart)
app.post('/api/posts/:id/heart', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);

    if (!post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    post.hearts += 1; // Tăng lượt tim lên 1
    saveDb();
    console.log(`[<3] Bài viết ${postId} vừa được thả tim (Tổng: ${post.hearts})`);
    res.json({ success: true, hearts: post.hearts });
});

// 4. Bình luận vào bài viết (POST /api/posts/:id/comment)
app.post('/api/posts/:id/comment', (req, res) => {
    const postId = req.params.id;
    const { text, author } = req.body;

    if (!text || text.trim() === '') {
        return res.status(400).json({ success: false, message: 'Bình luận không được để trống!' });
    }

    const post = posts.find(p => p.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    const newComment = {
        id: Date.now().toString(),
        author: author || 'Ẩn danh',
        text: text.trim(),
        timestamp: Date.now()
    };

    post.comments.push(newComment);
    saveDb();
    console.log(`[MSG] [${newComment.author}] bình luận ở bài ${postId}: ${text}`);
    res.json({ success: true, comment: newComment });
});

// 5. Xóa bài viết (DELETE /api/posts/:id)
app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    const { username } = req.query; // Xác nhận xem ai là người đang yêu cầu xóa

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết!' });
    }

    // Chỉ người đăng bài mới được xóa
    if (posts[postIndex].author !== username) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa ảnh của người khác!' });
    }

    posts.splice(postIndex, 1);
    saveDb();
    console.log(`[DEL] ${username} đã gỡ bài viết ${postId}`);
    res.json({ success: true, message: 'Đã gỡ bài viết!' });
});

// ==========================================
// API USER & BẠN BÈ (HỆ THỐNG LỜI MỜI)
// ==========================================

// Lời mời kết bạn đang chờ xử lý (đã lấy từ db.json)
// let friendRequests = db.friendRequests || [];

// Đăng nhập / Khởi tạo User / Bảo mật Mật khẩu
app.post('/api/users/login', (req, res) => {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Thiếu tên hiển thị' });
    if (!password) return res.status(400).json({ success: false, message: 'Thiếu mật khẩu' });

    if (!users[username]) {
        // Tự động đăng ký nếu tài khoản mới
        users[username] = { password: password, friends: [] };
        saveDb();
        console.log(`[USER] Tạo mới tài khoản: ${username}`);
        const pendingCount = friendRequests.filter(r => r.to === username).length;
        return res.json({ success: true, username, friends: [], pendingCount, message: "Tạo tài khoản mới thành công!" });
    }

    // Nếu tài khoản đã tồn tại, kiểm tra mật khẩu
    if (users[username].password !== password) {
        return res.status(401).json({ success: false, message: 'Sai mật khẩu tài khoản! Vui lòng nhập lại.' });
    }

    // Đếm số lời mời đang chờ
    const pendingCount = friendRequests.filter(r => r.to === username).length;
    res.json({ success: true, username, friends: users[username].friends, pendingCount });
});

// Gửi lời mời kết bạn
app.post('/api/users/friend/request', (req, res) => {
    const { username, friendName, message } = req.body;

    if (!users[username]) return res.status(404).json({ success: false, message: "Bạn chưa đăng nhập!" });
    if (!users[friendName]) return res.status(404).json({ success: false, message: "Không tìm thấy người này (họ chưa từng mở ứng dụng)" });
    if (username === friendName) return res.status(400).json({ success: false, message: "Không thể tự kết bạn với chính mình" });

    // Kiểm tra đã là bạn bè chưa
    if (users[username].friends.includes(friendName)) {
        return res.status(400).json({ success: false, message: `Bạn và ${friendName} đã là bạn bè rồi!` });
    }

    // Kiểm tra đã gửi lời mời trước đó chưa
    const existingRequest = friendRequests.find(r => r.from === username && r.to === friendName);
    if (existingRequest) {
        return res.status(400).json({ success: false, message: "Bạn đã gửi lời mời rồi, hãy đợi họ chấp nhận!" });
    }

    // Kiểm tra nếu đối phương đã gửi lời mời cho mình → tự động chấp nhận
    const reverseRequest = friendRequests.find(r => r.from === friendName && r.to === username);
    if (reverseRequest) {
        // Chấp nhận luôn
        friendRequests = friendRequests.filter(r => !(r.from === friendName && r.to === username));
        if (!users[username].friends.includes(friendName)) users[username].friends.push(friendName);
        if (!users[friendName].friends.includes(username)) users[friendName].friends.push(username);
        saveDb();
        console.log(`[FRIEND] ${username} và ${friendName} đã thành bạn bè (tự động chấp nhận lời mời ngược)`);
        return res.json({ success: true, message: `${friendName} cũng đã gửi lời mời cho bạn. Hai bạn giờ là bạn bè!`, friends: users[username].friends });
    }

    friendRequests.push({ from: username, to: friendName, message: message || '', timestamp: Date.now() });
    saveDb();
    console.log(`[REQUEST] ${username} gửi lời mời kết bạn tới ${friendName} với lời nhắn: "${message || ''}"`);
    res.json({ success: true, message: `Đã gửi lời mời kết bạn tới ${friendName}! Đợi họ chấp nhận nhé.` });
});

// Lấy danh sách lời mời đang chờ (người khác gửi cho mình)
app.get('/api/users/:username/requests', (req, res) => {
    const { username } = req.params;
    const pending = friendRequests.filter(r => r.to === username).map(r => ({
        from: r.from,
        message: r.message || '',
        timestamp: r.timestamp
    }));
    res.json({ success: true, requests: pending });
});

// Chấp nhận lời mời kết bạn
app.post('/api/users/friend/accept', (req, res) => {
    const { username, fromUser } = req.body;

    const reqIndex = friendRequests.findIndex(r => r.from === fromUser && r.to === username);
    if (reqIndex === -1) {
        return res.status(404).json({ success: false, message: "Không tìm thấy lời mời này!" });
    }

    // Xóa lời mời và thêm bạn bè 2 chiều
    friendRequests.splice(reqIndex, 1);
    if (!users[username].friends.includes(fromUser)) users[username].friends.push(fromUser);
    if (users[fromUser] && !users[fromUser].friends.includes(username)) users[fromUser].friends.push(username);
    saveDb();

    console.log(`[ACCEPT] ${username} chấp nhận lời mời từ ${fromUser}`);
    res.json({ success: true, message: `Đã chấp nhận! Bạn và ${fromUser} giờ là bạn bè.`, friends: users[username].friends });
});

// Từ chối lời mời kết bạn
app.post('/api/users/friend/reject', (req, res) => {
    const { username, fromUser } = req.body;

    friendRequests = friendRequests.filter(r => !(r.from === fromUser && r.to === username));
    saveDb();

    console.log(`[REJECT] ${username} từ chối lời mời từ ${fromUser}`);
    res.json({ success: true, message: `Đã từ chối lời mời từ ${fromUser}.` });
});

// Lấy danh sách bạn bè
app.get('/api/users/:username/friends', (req, res) => {
    const { username } = req.params;
    if (!users[username]) return res.json({ success: true, friends: [] });
    res.json({ success: true, friends: users[username].friends });
});

// ==========================================
// API ADMIN QUẢN LÝ
// ==========================================

// Lấy danh sách tất cả user
app.get('/api/admin/users', (req, res) => {
    const userList = Object.keys(users).map(username => {
        return {
            username: username,
            friendCount: users[username].friends.length,
            postCount: posts.filter(p => p.author === username).length
        };
    });
    res.json({ success: true, users: userList });
});

// Xóa một user
app.delete('/api/admin/users/:username', (req, res) => {
    const { username } = req.params;
    if (!users[username]) return res.status(404).json({ success: false, message: 'User không tồn tại!' });

    // Xóa user khỏi db
    delete users[username];

    // Xóa user khỏi danh sách bạn bè của người khác
    Object.keys(users).forEach(u => {
        users[u].friends = users[u].friends.filter(f => f !== username);
    });

    // Xóa toàn bộ bài đăng của user
    posts = posts.filter(p => p.author !== username);

    saveDb();

    console.log(`[ADMIN] Đã xóa toàn bộ dữ liệu của người dùng: ${username}`);
    res.json({ success: true, message: `Đã xóa ${username} thành công!` });
});

// Khởi chạy Server
app.listen(PORT, () => {
    console.log(`🚀 Server backend đang chạy tại http://localhost:${PORT}`);
    console.log(`👉 Mở điện thoại cùng mạng WiFi và truy cập địa chỉ IP máy tính (VD: http://192.168.x.x:${PORT}) để trải nghiệm.`);
});


// ==========================================
// FRONTEND BẢN GỘP (HTML + CSS + JS)
// ==========================================
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="vi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Locket Clone</title>
    <!-- Tích hợp Tailwind CSS qua CDN để làm giao diện Dark Mode nhanh chóng -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Thư viện MediaPipe Face Mesh (AI) -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>
    <script>
        // Cấu hình màu chủ đạo cho Tailwind
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        brand: '#ffb000', // Màu vàng đặc trưng giống Locket
                        dark: '#121212',
                        darker: '#0a0a0a'
                    }
                }
            }
        }
    </script>
    <style>
        /* Ẩn scrollbar để giao diện mượt như app native */
        ::-webkit-scrollbar {
            display: none;
        }

        body {
            -ms-overflow-style: none;
            scrollbar-width: none;
            background-color: #0a0a0a;
            color: white;
        }

        .aspect-square {
            aspect-ratio: 1 / 1;
        }
    </style>
</head>

<body class="bg-darker font-sans antialiased pb-20">

    <!-- HEADER -->
    <header
        class="fixed top-0 left-0 right-0 z-50 bg-dark/90 backdrop-blur-md p-4 flex justify-between items-center border-b border-gray-800">
        <div class="flex items-center space-x-3.5">
            <!-- Nút Bạn Bè (có badge thông báo) -->
            <button onclick="openFriends()" class="text-white hover:text-brand transition relative">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z">
                    </path>
                </svg>
                <span id="friend-badge" class="hidden absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center text-white">0</span>
            </button>
            
            <!-- Nút Chia sẻ mã QR -->
            <button onclick="openShareQr()" class="text-white hover:text-brand transition" title="Mã QR kết bạn">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z">
                    </path>
                </svg>
            </button>
        </div>
        <h1 id="app-logo" onclick="handleLogoClick()"
            class="text-2xl font-bold text-brand tracking-wider select-none cursor-pointer">MOMENTS</h1>
        <!-- Nút Trò chơi Flappy Bird -->
        <button onclick="openGame()" class="text-brand hover:text-white transition">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        </button>
    </header>

    <!-- MAIN CONTENT -->
    <main class="mt-16 w-full max-w-md mx-auto relative">

        <!-- PHẦN 1: KHU VỰC CAMERA -->
        <section class="p-4 flex flex-col items-center">
            <!-- Khung hiển thị Camera hoặc Ảnh đã chụp -->
            <div
                class="relative w-full aspect-square bg-gray-900 rounded-3xl overflow-hidden shadow-lg border border-gray-800">
                <!-- Video stream từ Camera -->
                <video id="camera-stream" class="w-full h-full object-cover" autoplay playsinline></video>
                <!-- Ảnh preview sau khi chụp -->
                <img id="photo-preview" class="w-full h-full object-cover hidden" alt="Preview">
                <!-- Canvas ẩn để xử lý việc chụp ảnh -->
                <canvas id="canvas" class="hidden"></canvas>
            </div>

            <!-- Các nút điều khiển Camera -->
            <div id="camera-controls" class="mt-6 flex items-center justify-center space-x-8">
                <!-- Nút chọn ảnh từ thư viện -->
                <button onclick="document.getElementById('file-input').click()"
                    class="p-3 bg-gray-800 rounded-full hover:bg-gray-700 transition">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z">
                        </path>
                    </svg>
                </button>
                <input type="file" id="file-input" accept="image/*" class="hidden" onchange="handleFileUpload(event)">

                <!-- Nút Chụp Ảnh (Nút tròn to ở giữa) -->
                <button id="capture-btn" onclick="capturePhoto()"
                    class="w-20 h-20 bg-white rounded-full border-4 border-brand shadow-[0_0_15px_rgba(255,176,0,0.5)] active:scale-95 transition-transform"></button>

                <!-- Nút Đảo Camera -->
                <button onclick="switchCamera()" class="p-3 bg-gray-800 rounded-full hover:bg-gray-700 transition">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15">
                        </path>
                    </svg>
                </button>
            </div>

            <!-- Khu vực viết Caption & Nút Đăng (Chỉ hiện sau khi đã chụp ảnh) -->
            <div id="post-controls" class="w-full mt-4 hidden flex-col items-center">
                <input type="text" id="caption-input" placeholder="Thêm mô tả cho khoảnh khắc này..."
                    class="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-brand transition text-center mb-4">

                <div class="flex space-x-4 w-full">
                    <!-- Nút Chụp Lại -->
                    <button onclick="retakePhoto()"
                        class="flex-1 py-3 bg-gray-700 rounded-xl font-bold active:bg-gray-600 transition">Chụp
                        lại</button>
                    <!-- Nút ĐĂNG -->
                    <button id="submit-post-btn" onclick="submitPost()"
                        class="flex-1 py-3 bg-brand text-black rounded-xl font-bold active:bg-yellow-500 transition flex justify-center items-center">
                        <span id="submit-text">ĐĂNG KHOẢNH KHẮC</span>
                    </button>
                </div>
            </div>
        </section>

        <!-- Đường kẻ phân cách -->
        <div class="w-full h-px bg-gray-800 my-4"></div>

        <!-- PHẦN 3: BẢNG TIN (FEED) -->
        <section id="feed" class="p-4 space-y-8 pb-10">
            <!-- Các bài đăng sẽ được JavaScript chèn tự động vào đây -->
            <p class="text-center text-gray-500 text-sm">Đang tải bảng tin...</p>
        </section>

    </main>

    <!-- MODAL ĐĂNG NHẬP -->
    <div id="login-modal" class="fixed inset-0 z-[80] bg-darker flex flex-col items-center justify-center p-6 hidden">
        <h2 class="text-4xl font-black text-brand mb-2">ĐĂNG NHẬP</h2>
        <p class="text-center text-gray-400 mb-6 text-sm">Tài khoản mới sẽ tự động đăng ký với mật khẩu được nhập!</p>
        
        <input type="text" id="username-input" placeholder="Tên tài khoản..."
            class="w-full max-w-sm bg-gray-800 text-white rounded-2xl px-6 py-4 outline-none border border-gray-700 focus:border-brand transition text-center mb-4 text-xl font-bold">
            
        <input type="password" id="password-input" placeholder="Mật khẩu bảo mật..."
            class="w-full max-w-sm bg-gray-800 text-white rounded-2xl px-6 py-4 outline-none border border-gray-700 focus:border-brand transition text-center mb-6 text-xl font-bold">
            
        <button onclick="loginUser()"
            class="w-full max-w-sm py-4 bg-brand text-black rounded-2xl font-black text-xl hover:bg-yellow-500 active:scale-95 transition-transform">VÀO
            APP</button>
    </div>

    <!-- MODAL QUẢN TRỊ VIÊN (ADMIN) -->
    <div id="admin-modal" class="fixed inset-0 z-[90] bg-darker hidden flex-col p-6 pt-12">
        <div class="flex justify-between items-center mb-8">
            <div>
                <h2 class="text-3xl font-black text-red-500">TƯỜNG ADMIN</h2>
                <p class="text-gray-400 text-sm mt-1">Khu vực tuyệt mật!</p>
            </div>
            <button onclick="closeAdmin()" class="p-3 bg-gray-800 rounded-full text-white active:scale-95 transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12">
                    </path>
                </svg>
            </button>
        </div>

        <h3 class="text-gray-400 font-bold mb-4">DANH SÁCH THÀNH VIÊN (<span id="admin-user-count">0</span>)</h3>
        <div id="admin-users-list" class="space-y-3 overflow-y-auto pb-10">
            <!-- Danh sách user chèn vào đây -->
            <p class="text-gray-600 text-sm italic">Đang tải...</p>
        </div>
    </div>

    <!-- MODAL BẠN BÈ -->
    <div id="friends-modal" class="fixed inset-0 z-[70] bg-darker hidden flex-col p-6 pt-12 overflow-y-auto">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h2 class="text-3xl font-black text-brand">BẠN BÈ</h2>
                <p class="text-gray-400 text-sm mt-1">Xin chào, <span id="current-user-display"
                        class="font-bold text-white"></span></p>
            </div>
            <button onclick="closeFriends()" class="p-3 bg-gray-800 rounded-full text-white active:scale-95 transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12">
                    </path>
                </svg>
            </button>
        </div>

        <!-- KHU VỰC CHIA SẺ LINK & QR CODE KẾT BẠN -->
        <div class="bg-gray-900/90 border border-gray-800 p-4 rounded-2xl mb-6 flex flex-col items-center text-center shadow-lg">
            <h3 class="text-xs font-black text-brand uppercase tracking-widest mb-3">Mã QR & Link Kết Bạn Của Tôi</h3>
            
            <!-- Ảnh QR Code -->
            <div class="p-3 bg-white rounded-xl mb-3 aspect-square w-36 flex items-center justify-center shadow-inner">
                <img id="my-qr-image" src="" alt="Mã QR kết bạn" class="w-full h-full object-contain">
            </div>
            
            <p class="text-xs text-gray-400 mb-3 px-2">Để người khác quét mã này hoặc bấm link dưới để kết bạn ngay lập tức!</p>
            
            <div class="w-full flex items-center space-x-2 bg-gray-800 p-1.5 rounded-xl border border-gray-700">
                <input type="text" id="share-link-input" readonly
                    class="flex-1 bg-transparent text-gray-300 text-xs px-2 outline-none cursor-default truncate">
                <button onclick="copyShareLink()" class="px-4 py-2 bg-brand text-black rounded-lg text-xs font-bold hover:bg-yellow-500 active:scale-95 transition shrink-0">
                    Sao chép
                </button>
            </div>
        </div>

        <!-- GỬI LỜI MỜI KẾT BẠN -->
        <div class="flex flex-col space-y-2 mb-6 bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Gửi Lời Mời Kết Bạn</h3>
            <div class="flex space-x-2">
                <input type="text" id="friend-input" placeholder="Nhập tên tài khoản..."
                    class="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-brand transition text-sm">
                <button onclick="sendFriendRequest()"
                    class="px-5 bg-brand text-black rounded-xl font-bold hover:bg-yellow-500 active:scale-95 transition text-sm">GỬI</button>
            </div>
            <input type="text" id="friend-message-input" placeholder="Nhập lời nhắn gửi kèm (không bắt buộc)..."
                class="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none border border-gray-700 focus:border-brand transition text-sm">
        </div>

        <!-- LỜi mời đang chờ -->
        <h3 class="text-gray-400 font-bold mb-4">LỜI MỜI KẾT BẠN (<span id="request-count">0</span>)</h3>
        <div id="requests-list" class="space-y-3 mb-8">
            <p class="text-gray-600 text-sm italic">Không có lời mời nào.</p>
        </div>

        <h3 class="text-gray-400 font-bold mb-4">DANH SÁCH BẠN BÈ (<span id="friend-count">0</span>)</h3>
        <div id="friends-list" class="space-y-3 pb-10">
            <p class="text-gray-600 text-sm italic">Bạn chưa kết bạn với ai cả...</p>
        </div>
    </div>

    <!-- MODAL GỬI KẾT BẠN QUA LINK -->
    <div id="add-friend-url-modal" class="fixed inset-0 z-[100] bg-black/95 hidden flex-col items-center justify-center p-6">
        <div class="bg-gray-900 w-full max-w-sm rounded-3xl p-6 border border-gray-800 flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-brand rounded-full flex items-center justify-center font-black text-black text-3xl uppercase mb-4 shadow-[0_0_15px_rgba(255,176,0,0.3)]">
                <span id="url-friend-avatar">?</span>
            </div>
            
            <h2 class="text-2xl font-black text-white mb-1">Kết Bạn Với <span id="url-friend-name" class="text-brand"></span></h2>
            <p class="text-xs text-gray-400 mb-6">Bạn được chia sẻ link kết bạn trực tiếp từ người này</p>
            
            <div class="w-full space-y-4 mb-6">
                <div>
                    <label class="block text-left text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lời nhắn gửi kèm</label>
                    <textarea id="url-friend-message" rows="3" placeholder="Ví dụ: Chào bạn, mình là..." 
                        class="w-full bg-gray-800 text-white rounded-xl p-3 outline-none border border-gray-700 focus:border-brand transition text-sm resize-none"></textarea>
                </div>
            </div>
            
            <div class="flex space-x-3 w-full">
                <button onclick="closeUrlFriendModal()" class="flex-1 py-3 bg-gray-800 hover:bg-gray-750 rounded-xl font-bold text-sm text-gray-300 transition active:scale-95">Đóng</button>
                <button onclick="submitUrlFriendRequest()" class="flex-1 py-3 bg-brand text-black rounded-xl font-bold text-sm hover:bg-yellow-500 transition active:scale-95 shadow-md">Gửi Yêu Cầu</button>
            </div>
        </div>
    </div>

    <!-- MODAL SHARE QR & LINK NHANH (POP-UP GLASSMORPHISM) -->
    <div id="share-qr-modal" class="fixed inset-0 z-[75] bg-black/80 hidden flex-col items-center justify-center p-6 backdrop-blur-sm">
        <div class="bg-gray-900/90 border border-gray-800 w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl relative">
            <!-- Nút đóng -->
            <button onclick="closeShareQr()" class="absolute top-4 right-4 p-2 bg-gray-800 hover:bg-gray-750 rounded-full text-white active:scale-95 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>

            <h2 class="text-2xl font-black text-brand mb-1">MÃ QR KẾT BẠN</h2>
            <p class="text-xs text-gray-400 mb-6">Xin chào <span id="share-qr-user" class="text-white font-bold"></span>! Quét mã bên dưới để kết bạn</p>
            
            <!-- Ảnh QR Code -->
            <div class="p-4 bg-white rounded-2xl mb-6 aspect-square w-44 flex items-center justify-center shadow-lg">
                <img id="share-qr-image" src="" alt="Mã QR kết bạn" class="w-full h-full object-contain">
            </div>
            
            <p class="text-xs text-gray-400 mb-4 px-2">Hoặc chia sẻ đường link này trực tiếp cho bạn bè của bạn:</p>
            
            <div class="w-full flex flex-col space-y-3">
                <div class="w-full flex items-center space-x-2 bg-gray-800 p-2 rounded-xl border border-gray-750">
                    <input type="text" id="share-qr-link-input" readonly
                        class="flex-1 bg-transparent text-gray-300 text-xs px-2 outline-none cursor-default truncate">
                    <button onclick="copyShareLink2()" class="px-4 py-2 bg-brand text-black rounded-lg text-xs font-bold hover:bg-yellow-500 active:scale-95 transition shrink-0">
                        Sao chép
                    </button>
                </div>
                
                <button onclick="shareMyLinkNative()" class="w-full py-3.5 bg-brand text-black rounded-xl font-black text-sm hover:bg-yellow-500 active:scale-95 transition shadow-[0_4px_15px_rgba(255,176,0,0.2)]">
                    🚀 CHIA SẺ QUA ỨNG DỤNG KHÁC
                </button>
            </div>
        </div>
    </div>

    <!-- PHẦN 4: MÀN HÌNH GAME OVERLAY (FLAPPY BIRD AI) -->
    <div id="game-overlay" class="fixed inset-0 z-[60] bg-darker hidden flex-col items-center justify-center">
        <!-- Nút Đóng Game -->
        <button onclick="closeGame()" class="absolute top-6 left-6 p-2 bg-gray-800 rounded-full text-white z-30">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>

        <!-- Màn hình chơi game -->
        <div
            class="relative w-full max-w-md h-full max-h-[900px] bg-sky-400 overflow-hidden shadow-2xl shadow-brand/20">
            <!-- Điểm số -->
            <div class="absolute top-10 w-full text-center text-6xl font-black text-white z-20"
                style="text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">
                <span id="game-score">0</span>
            </div>

            <!-- Canvas vẽ game -->
            <canvas id="game-canvas" class="w-full h-full"></canvas>

            <!-- Màn hình chờ / Bắt đầu -->
            <div id="game-start-screen"
                class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center p-6 z-20">
                <h2 class="text-4xl font-black text-brand mb-4">FLAPPY AI</h2>
                <div class="bg-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl w-full max-w-sm">
                    <p class="text-white mb-2 text-lg">Cách chơi cực ảo:</p>
                    <p class="text-gray-400 mb-6 text-sm">Hãy để mặt trước camera và...</p>
                    <div class="text-5xl animate-bounce mb-6">😮</div>
                    <p class="text-yellow-400 font-bold text-xl mb-4">HÁ MIỆNG ĐỂ CHIM BAY!</p>
                </div>
                <p id="ai-loading-text" class="text-gray-300 mt-6 animate-pulse font-bold tracking-widest text-sm">ĐANG
                    TẢI MÔ HÌNH TRÍ TUỆ NHÂN TẠO...</p>
                <button id="start-game-btn" onclick="startGame()"
                    class="hidden mt-6 py-4 px-10 bg-brand text-black rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-transform shadow-[0_0_20px_rgba(255,176,0,0.4)]">VÀO
                    CHƠI</button>
            </div>

            <!-- Game Over -->
            <div id="game-over-screen"
                class="absolute inset-0 bg-black/80 hidden flex-col items-center justify-center text-center p-6 z-20">
                <h2 class="text-5xl font-black text-red-500 mb-2">THUA!</h2>
                <div class="bg-white rounded-2xl p-6 w-4/5 my-6 shadow-xl text-black">
                    <p class="text-gray-500 font-bold mb-1">ĐIỂM CỦA BẠN</p>
                    <p id="final-score" class="text-6xl font-black text-brand mb-2">0</p>
                </div>
                <button onclick="resetGame()"
                    class="py-4 px-10 bg-brand text-black rounded-full font-black text-xl hover:scale-105 active:scale-95 transition shadow-[0_0_20px_rgba(255,176,0,0.4)]">CHƠI
                    LẠI ĐI CÒN GÌ NỮA</button>
            </div>
        </div>
    </div>

    <!-- JAVASCRIPT LOGIC -->
    <script>
        // Các biến toàn cục
        let videoStream = null;
        let currentFacingMode = "user"; // "user" = cam trước, "environment" = cam sau
        let capturedImageBase64 = null;
        let currentUser = localStorage.getItem('locket_username');

        // Tự động nhận diện IP hoặc Localhost để gọi API cho chính xác
        const API_URL = window.location.origin.includes('file://')
            ? "http://localhost:3000/api"
            : \`\${window.location.origin}/api\`;

        // Các elements
        const video = document.getElementById('camera-stream');
        const canvas = document.getElementById('canvas');
        const photoPreview = document.getElementById('photo-preview');
        const cameraControls = document.getElementById('camera-controls');
        const postControls = document.getElementById('post-controls');
        const captionInput = document.getElementById('caption-input');
        const feedContainer = document.getElementById('feed');

        // ==========================================
        // 1. LOGIC XỬ LÝ CAMERA
        // ==========================================

        // Hàm mở Camera
        async function initCamera() {
            try {
                if (videoStream) {
                    videoStream.getTracks().forEach(track => track.stop());
                }
                const constraints = {
                    video: { facingMode: currentFacingMode, width: { ideal: 1080 }, height: { ideal: 1080 } }
                };
                videoStream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = videoStream;
            } catch (err) {
                console.error("Lỗi khi mở Camera:", err);
                alert("Không thể truy cập Camera. Vui lòng cấp quyền hoặc dùng tính năng Chọn Ảnh.");
            }
        }

        // Đảo Camera (Trước/Sau)
        function switchCamera() {
            currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
            initCamera();
        }

        // Hàm Chụp Ảnh
        function capturePhoto() {
            if (!videoStream) return;
            // Đặt kích thước canvas bằng với video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            // Vẽ frame hiện tại của video lên canvas
            // Nếu dùng cam trước, cần lật ảnh lại cho đỡ ngược
            if (currentFacingMode === "user") {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Chuyển canvas thành chuỗi Base64 JPEG
            capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
            showPreview();
        }

        // Hàm xử lý khi người dùng chọn ảnh từ máy
        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                capturedImageBase64 = e.target.result;
                showPreview();
            };
            reader.readAsDataURL(file);
        }

        // Hiển thị ảnh đã chụp/chọn và hiện form đăng
        function showPreview() {
            video.classList.add('hidden');
            photoPreview.src = capturedImageBase64;
            photoPreview.classList.remove('hidden');
            cameraControls.classList.add('hidden');
            postControls.classList.remove('hidden');
            postControls.classList.add('flex');
            captionInput.focus();
        }

        // Chụp lại ảnh
        function retakePhoto() {
            capturedImageBase64 = null;
            photoPreview.classList.add('hidden');
            video.classList.remove('hidden');
            postControls.classList.add('hidden');
            postControls.classList.remove('flex');
            cameraControls.classList.remove('hidden');
            captionInput.value = '';
        }

        // ==========================================
        // 2. LOGIC ĐĂNG NHẬP, BẠN BÈ VÀ ADMIN
        // ==========================================

        // --- ADMIN LOGIC ---
        let logoClickCount = 0;
        let logoClickTimer;

        function handleLogoClick() {
            logoClickCount++;
            clearTimeout(logoClickTimer);

            if (logoClickCount === 3) {
                openAdmin();
                logoClickCount = 0;
            } else {
                logoClickTimer = setTimeout(() => {
                    logoClickCount = 0;
                }, 1000); // Reset nếu không click liên tục trong 1 giây
            }
        }

        function openAdmin() {
            document.getElementById('admin-modal').classList.remove('hidden');
            document.getElementById('admin-modal').classList.add('flex');
            loadAdminUsers();
        }

        function closeAdmin() {
            document.getElementById('admin-modal').classList.add('hidden');
            document.getElementById('admin-modal').classList.remove('flex');
            loadPosts();
        }

        async function loadAdminUsers() {
            try {
                const res = await fetch(\`\${API_URL}/admin/users\`);
                const data = await res.json();
                if (data.success) {
                    const listEl = document.getElementById('admin-users-list');
                    document.getElementById('admin-user-count').innerText = data.users.length;

                    if (data.users.length === 0) {
                        listEl.innerHTML = '<p class="text-gray-600 text-sm italic">Chưa có ai đăng ký cả...</p>';
                    } else {
                        listEl.innerHTML = data.users.map(u => \`
                            <div class="bg-gray-800 p-4 rounded-xl flex justify-between items-center">
                                <div class="flex items-center space-x-3">
                                    <div class="w-10 h-10 bg-brand rounded-full flex items-center justify-center font-bold text-black text-xl uppercase">\${u.username.charAt(0)}</div>
                                    <div>
                                        <span class="text-white font-bold text-lg">\${u.username}</span>
                                        <p class="text-gray-400 text-xs">\${u.friendCount} bạn bè • \${u.postCount} ảnh</p>
                                    </div>
                                </div>
                                <button onclick="deleteUser('\${u.username}')" class="px-3 py-2 bg-red-600/20 text-red-500 rounded-lg font-bold hover:bg-red-600 hover:text-white transition">Xóa</button>
                            </div>
                        \`).join('');
                    }
                }
            } catch (err) {
                alert("Lỗi tải danh sách Admin!");
            }
        }

        async function deleteUser(username) {
            if (!confirm(\`Bạn có chắc chắn muốn xóa user "\${username}" cùng toàn bộ bài viết không?\`)) return;
            try {
                const res = await fetch(\`\${API_URL}/admin/users/\${username}\`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    loadAdminUsers(); // Tải lại danh sách
                    if (username === currentUser) {
                        // Nếu tự xóa mình
                        localStorage.removeItem('locket_username');
                        currentUser = null;
                        closeAdmin();
                        checkAuth();
                    }
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert("Lỗi khi xóa!");
            }
        }
        // --- KẾT THÚC ADMIN LOGIC ---

        function checkAuth() {
            if (!currentUser) {
                document.getElementById('login-modal').classList.remove('hidden');
            } else {
                const currentPassword = localStorage.getItem('locket_password') || '';
                // Đăng nhập ngầm lại để báo cho server
                fetch(\`\${API_URL}/users/login\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, password: currentPassword })
                }).then(async (res) => {
                    const data = await res.json();
                    if (!data.success) {
                        // Nếu sai mật khẩu hoặc tài khoản bị xóa bởi Admin
                        logoutUser();
                    } else {
                        loadPosts();
                    }
                }).catch(() => {
                    // Lỗi mạng tạm thời, vẫn tải bài đăng từ local
                    loadPosts();
                });
            }
        }

        function logoutUser() {
            localStorage.removeItem('locket_username');
            localStorage.removeItem('locket_password');
            currentUser = null;
            document.getElementById('login-modal').classList.remove('hidden');
        }

        async function loginUser() {
            const input = document.getElementById('username-input').value.trim();
            const passwordInput = document.getElementById('password-input').value.trim();
            if (!input) return alert("Vui lòng nhập tên!");
            if (!passwordInput) return alert("Vui lòng nhập mật khẩu!");

            try {
                const res = await fetch(\`\${API_URL}/users/login\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: input, password: passwordInput })
                });
                const data = await res.json();
                if (data.success) {
                    currentUser = input;
                    localStorage.setItem('locket_username', input);
                    localStorage.setItem('locket_password', passwordInput);
                    
                    if (data.message) {
                        alert(data.message); // Hiển thị "Tạo tài khoản mới thành công!"
                    }
                    
                    document.getElementById('login-modal').classList.add('hidden');
                    document.getElementById('username-input').value = '';
                    document.getElementById('password-input').value = '';
                    
                    // Nếu đang có yêu cầu kết bạn chờ sẵn từ URL
                    if (pendingAddFriendFromUrl) {
                        showUrlFriendModal(pendingAddFriendFromUrl);
                    }
                    
                    loadPosts();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert("Lỗi kết nối Server!");
            }
        }

        function openFriends() {
            document.getElementById('friends-modal').classList.remove('hidden');
            document.getElementById('friends-modal').classList.add('flex');
            document.getElementById('current-user-display').innerText = currentUser;

            // Tạo link chia sẻ và ảnh QR Code
            const shareUrl = window.location.origin + window.location.pathname + '?add-friend=' + encodeURIComponent(currentUser);
            document.getElementById('share-link-input').value = shareUrl;
            
            const qrUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=\${encodeURIComponent(shareUrl)}\`;
            document.getElementById('my-qr-image').src = qrUrl;

            loadFriends();
            loadFriendRequests();
        }

        function closeFriends() {
            document.getElementById('friends-modal').classList.add('hidden');
            document.getElementById('friends-modal').classList.remove('flex');
            loadPosts();
        }

        function copyShareLink() {
            const shareInput = document.getElementById('share-link-input');
            shareInput.select();
            shareInput.setSelectionRange(0, 99999); // Cho thiết bị di động
            navigator.clipboard.writeText(shareInput.value).then(() => {
                alert("Đã sao chép link kết bạn vào Clipboard!");
            }).catch(() => {
                alert("Không thể tự động sao chép. Hãy tự bôi đen và sao chép link nhé!");
            });
        }

        async function loadFriends() {
            try {
                const res = await fetch(\`\${API_URL}/users/\${currentUser}/friends\`);
                const data = await res.json();
                if (data.success) {
                    const listEl = document.getElementById('friends-list');
                    document.getElementById('friend-count').innerText = data.friends.length;

                    if (data.friends.length === 0) {
                        listEl.innerHTML = '<p class="text-gray-600 text-sm italic">Bạn chưa kết bạn với ai cả...</p>';
                    } else {
                        listEl.innerHTML = data.friends.map(f => \`
                            <div class="bg-gray-800 p-4 rounded-xl flex items-center space-x-3">
                                <div class="w-10 h-10 bg-brand rounded-full flex items-center justify-center font-bold text-black text-xl uppercase">\${f.charAt(0)}</div>
                                <span class="text-white font-bold text-lg">\${f}</span>
                            </div>
                        \`).join('');
                    }
                }
            } catch (err) { }
        }

        async function loadFriendRequests() {
            try {
                const res = await fetch(\`\${API_URL}/users/\${currentUser}/requests\`);
                const data = await res.json();
                if (data.success) {
                    const listEl = document.getElementById('requests-list');
                    const badge = document.getElementById('friend-badge');
                    document.getElementById('request-count').innerText = data.requests.length;

                    // Cập nhật badge thông báo
                    if (data.requests.length > 0) {
                        badge.classList.remove('hidden');
                        badge.classList.add('flex');
                        badge.innerText = data.requests.length;
                    } else {
                        badge.classList.add('hidden');
                        badge.classList.remove('flex');
                    }

                    if (data.requests.length === 0) {
                        listEl.innerHTML = '<p class="text-gray-600 text-sm italic">Không có lời mời nào.</p>';
                    } else {
                        listEl.innerHTML = data.requests.map(r => \`
                            <div class="bg-gray-800 p-4 rounded-xl flex flex-col space-y-3 shadow">
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center space-x-3">
                                        <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center font-bold text-black text-xl uppercase">\${r.from.charAt(0)}</div>
                                        <div>
                                            <span class="text-white font-bold">\${r.from}</span>
                                            <p class="text-gray-400 text-xs">Muốn kết bạn với bạn</p>
                                        </div>
                                    </div>
                                    <div class="flex space-x-2">
                                        <button onclick="acceptRequest('\${r.from}')" class="px-3 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-500 active:scale-95 transition text-sm">✅ Chấp nhận</button>
                                        <button onclick="rejectRequest('\${r.from}')" class="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg font-bold hover:bg-red-600 hover:text-white active:scale-95 transition text-sm">❌</button>
                                    </div>
                                </div>
                                \${r.message ? \`
                                    <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-700/50">
                                        <p class="text-gray-300 text-sm italic">💬 "\${r.message}"</p>
                                    </div>
                                \` : ''}
                            </div>
                        \`).join('');
                    }
                }
            } catch (err) { }
        }

        async function sendFriendRequest(customFriendName = null, customMessage = null) {
            const friendName = customFriendName || document.getElementById('friend-input').value.trim();
            const message = customMessage !== null ? customMessage : document.getElementById('friend-message-input').value.trim();
            if (!friendName) return alert("Vui lòng nhập tên tài khoản muốn kết bạn!");
            if (friendName === currentUser) return alert("Không thể tự kết bạn với chính mình!");

            try {
                const res = await fetch(\`\${API_URL}/users/friend/request\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, friendName, message })
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    if (!customFriendName) {
                        document.getElementById('friend-input').value = '';
                        document.getElementById('friend-message-input').value = '';
                    }
                    loadFriends(); // Tải lại nếu đã tự động chấp nhận
                }
            } catch (err) {
                alert("Lỗi kết nối tới máy chủ!");
            }
        }

        // --- LOGIC KẾT BẠN QUA URL/QR ---
        let pendingAddFriendFromUrl = null;

        function handleAddFriendUrlParam() {
            const urlParams = new URLSearchParams(window.location.search);
            const addFriendParam = urlParams.get('add-friend');
            if (addFriendParam) {
                // Xóa tham số khỏi URL để sạch sẽ thanh địa chỉ
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: newUrl }, '', newUrl);

                if (addFriendParam === currentUser) {
                    alert("Bạn không thể tự kết bạn với chính mình!");
                    return;
                }

                pendingAddFriendFromUrl = addFriendParam;
                
                if (!currentUser) {
                    alert(\`Vui lòng đăng nhập để gửi lời mời kết bạn tới "\${addFriendParam}"!\`);
                    document.getElementById('login-modal').classList.remove('hidden');
                } else {
                    showUrlFriendModal(addFriendParam);
                }
            }
        }

        function showUrlFriendModal(friendName) {
            document.getElementById('url-friend-name').innerText = friendName;
            document.getElementById('url-friend-avatar').innerText = friendName.charAt(0);
            document.getElementById('url-friend-message').value = \`Chào bạn, mình là \${currentUser}! Kết bạn với mình nhé.\`;
            document.getElementById('add-friend-url-modal').classList.remove('hidden');
            document.getElementById('add-friend-url-modal').classList.add('flex');
        }

        function closeUrlFriendModal() {
            document.getElementById('add-friend-url-modal').classList.add('hidden');
            document.getElementById('add-friend-url-modal').classList.remove('flex');
            pendingAddFriendFromUrl = null;
        }

        async function submitUrlFriendRequest() {
            if (!currentUser || !pendingAddFriendFromUrl) return;
            const message = document.getElementById('url-friend-message').value.trim();
            await sendFriendRequest(pendingAddFriendFromUrl, message);
            closeUrlFriendModal();
        }
        // --- KẾT THÚC LOGIC KẾT BẠN QUA URL/QR ---

        // --- LOGIC CHIA SẼ QR & LINK TRỰC TIẾP ---
        function openShareQr() {
            if (!currentUser) return alert("Vui lòng đăng nhập trước!");
            
            document.getElementById('share-qr-user').innerText = currentUser;
            
            const shareUrl = window.location.origin + window.location.pathname + '?add-friend=' + encodeURIComponent(currentUser);
            document.getElementById('share-qr-link-input').value = shareUrl;
            
            const qrUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=\${encodeURIComponent(shareUrl)}\`;
            document.getElementById('share-qr-image').src = qrUrl;
            
            document.getElementById('share-qr-modal').classList.remove('hidden');
            document.getElementById('share-qr-modal').classList.add('flex');
        }

        function closeShareQr() {
            document.getElementById('share-qr-modal').classList.add('hidden');
            document.getElementById('share-qr-modal').classList.remove('flex');
        }

        function copyShareLink2() {
            const shareInput = document.getElementById('share-qr-link-input');
            shareInput.select();
            shareInput.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(shareInput.value).then(() => {
                alert("Đã sao chép link kết bạn vào Clipboard!");
            }).catch(() => {
                alert("Không thể tự sao chép. Hãy tự bôi đen và copy link nhé!");
            });
        }

        function shareMyLinkNative() {
            const shareUrl = document.getElementById('share-qr-link-input').value;
            if (navigator.share) {
                navigator.share({
                    title: 'Fake Locket - Kết Bạn',
                    text: \`Hãy kết bạn Locket với mình nhé! Tên tài khoản của mình là: \${currentUser}\`,
                    url: shareUrl
                }).catch((err) => {
                    console.log("Hủy chia sẻ hoặc lỗi:", err);
                });
            } else {
                copyShareLink2();
            }
        }
        // --- KẾT THÚC LOGIC CHIA SẼ QR & LINK TRỰC TIẾP ---

        async function acceptRequest(fromUser) {
            try {
                const res = await fetch(\`\${API_URL}/users/friend/accept\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, fromUser })
                });
                const data = await res.json();
                if (data.success) {
                    loadFriends();
                    loadFriendRequests();
                } else {
                    alert(data.message);
                }
            } catch (err) { }
        }

        async function rejectRequest(fromUser) {
            try {
                const res = await fetch(\`\${API_URL}/users/friend/reject\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, fromUser })
                });
                const data = await res.json();
                if (data.success) {
                    loadFriendRequests();
                }
            } catch (err) { }
        }

        // Kiểm tra lời mời mới mỗi 10 giây
        setInterval(() => {
            if (currentUser) loadFriendRequests();
        }, 10000);

        // ==========================================
        // 3. LOGIC TƯƠNG TÁC SERVER (FETCH API)
        // ==========================================

        // Gửi ảnh lên Server
        async function submitPost() {
            if (!capturedImageBase64) return;
            if (!currentUser) return alert("Vui lòng đăng nhập trước!");

            const submitBtn = document.getElementById('submit-post-btn');
            submitBtn.innerHTML = "ĐANG TẢI...";
            submitBtn.disabled = true;

            try {
                const response = await fetch(\`\${API_URL}/posts\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        author: currentUser,
                        image: capturedImageBase64,
                        caption: captionInput.value
                    })
                });

                const data = await response.json();
                if (data.success) {
                    retakePhoto(); // Reset form
                    loadPosts();   // Tải lại bảng tin
                } else {
                    alert(data.message);
                }
            } catch (err) {
                console.error(err);
                alert("Lỗi kết nối tới Server!");
            } finally {
                submitBtn.innerHTML = "ĐĂNG KHOẢNH KHẮC";
                submitBtn.disabled = false;
            }
        }

        // Thả tim
        async function heartPost(postId) {
            try {
                const res = await fetch(\`\${API_URL}/posts/\${postId}/heart\`, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    document.getElementById(\`heart-count-\${postId}\`).innerText = data.hearts;
                    // Hiệu ứng tim đỏ
                    const icon = document.getElementById(\`heart-icon-\${postId}\`);
                    icon.classList.add('text-red-500', 'fill-current');
                }
            } catch (err) { console.error(err); }
        }

        // Gửi bình luận
        async function submitComment(postId) {
            if (!currentUser) return alert("Vui lòng đăng nhập!");
            const input = document.getElementById(\`comment-input-\${postId}\`);
            const text = input.value;
            if (!text.trim()) return;

            try {
                const res = await fetch(\`\${API_URL}/posts/\${postId}/comment\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, author: currentUser })
                });
                const data = await res.json();
                if (data.success) {
                    input.value = ''; // Xóa trắng ô nhập
                    loadPosts(); // Tải lại để hiện comment
                }
            } catch (err) { console.error(err); }
        }

        // Xóa bài viết
        async function deletePost(postId) {
            if (!confirm("Bạn có chắc chắn muốn gỡ khoảnh khắc này không?")) return;
            try {
                const res = await fetch(\`\${API_URL}/posts/\${postId}?username=\${currentUser}\`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    loadPosts();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                alert("Lỗi khi xóa bài viết!");
            }
        }

        // Tải danh sách bài đăng từ Server
        async function loadPosts() {
            if (!currentUser) return;
            try {
                const response = await fetch(\`\${API_URL}/posts?username=\${currentUser}\`);
                const data = await response.json();

                if (data.success) {
                    renderFeed(data.data);
                }
            } catch (err) {
                console.error(err);
                feedContainer.innerHTML = '<p class="text-center text-red-500">Lỗi không thể tải bảng tin.</p>';
            }
        }

        // ==========================================
        // 4. RENDER GIAO DIỆN BẢNG TIN
        // ==========================================
        function renderFeed(posts) {
            if (posts.length === 0) {
                feedContainer.innerHTML = '<p class="text-center text-gray-500 mt-10">Bạn bè chưa đăng gì. Hãy kết bạn hoặc tự đăng ảnh nhé!</p>';
                return;
            }

            feedContainer.innerHTML = ''; // Xóa cũ

            posts.forEach(post => {
                // Định dạng thời gian
                const date = new Date(post.timestamp);
                const timeString = \`\${date.getHours()}:\${date.getMinutes().toString().padStart(2, '0')} - \${date.getDate()}/\${date.getMonth() + 1}\`;

                // HTML cho danh sách comment
                const commentsHtml = post.comments.map(c =>
                    \`<p class="text-sm"><span class="font-bold text-gray-400">\${c.author}:</span> \${c.text}</p>\`
                ).join('');

                // Nút Xóa (chỉ hiện nếu là bài của mình)
                const deleteBtnHtml = post.author === currentUser
                    ? \`<button onclick="deletePost('\${post.id}')" class="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition" title="Gỡ ảnh này">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                       </button>\`
                    : '';

                const postHtml = \`
                    <div class="bg-gray-900 rounded-3xl p-4 shadow-lg border border-gray-800">
                        
                        <!-- Header người đăng -->
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-brand rounded-full flex items-center justify-center font-bold text-black text-xl uppercase">\${post.author.charAt(0)}</div>
                                <div>
                                    <p class="text-white font-bold">\${post.author}</p>
                                    <span class="text-xs text-gray-500">\${timeString}</span>
                                </div>
                            </div>
                            \${deleteBtnHtml}
                        </div>

                        <!-- Ảnh đại diện bài viết -->
                        <div class="rounded-2xl overflow-hidden aspect-square border border-gray-800">
                            <img src="\${post.image}" class="w-full h-full object-cover" loading="lazy">
                        </div>
                        
                        <!-- Caption -->
                        <div class="mt-4 flex justify-between items-start">
                            <p class="font-medium text-lg text-white break-words w-full">\${post.caption}</p>
                        </div>

                        <!-- Lượt tương tác -->
                        <div class="mt-3 flex items-center space-x-4">
                            <button onclick="heartPost('\${post.id}')" class="flex items-center space-x-1 text-gray-400 hover:text-red-500 transition active:scale-125">
                                <svg id="heart-icon-\${post.id}" class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                <span id="heart-count-\${post.id}" class="font-bold text-lg">\${post.hearts}</span>
                            </button>
                        </div>

                        <!-- Bình luận -->
                        <div class="mt-4">
                            <div class="space-y-1 mb-3 max-h-32 overflow-y-auto">
                                \${commentsHtml}
                            </div>
                            <div class="flex items-center space-x-2">
                                <input type="text" id="comment-input-\${post.id}" placeholder="Viết bình luận..." class="flex-1 bg-gray-800 text-sm text-white rounded-full px-4 py-2 outline-none border border-gray-700 focus:border-brand transition" onkeypress="if(event.key === 'Enter') submitComment('\${post.id}')">
                                <button onclick="submitComment('\${post.id}')" class="p-2 bg-brand text-black rounded-full hover:bg-yellow-500">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                \`;
                feedContainer.insertAdjacentHTML('beforeend', postHtml);
            });
        }

        // ==========================================
        // 4. LOGIC GAME FLAPPY BIRD & AI (FACE MESH)
        // ==========================================
        const gameOverlay = document.getElementById('game-overlay');
        const gameCanvas = document.getElementById('game-canvas');
        const ctxGame = gameCanvas.getContext('2d');
        const scoreEl = document.getElementById('game-score');
        const startScreen = document.getElementById('game-start-screen');
        const gameOverScreen = document.getElementById('game-over-screen');
        const startGameBtn = document.getElementById('start-game-btn');
        const aiLoadingText = document.getElementById('ai-loading-text');

        let isGameRunning = false;
        let animationId;
        let score = 0;
        let frames = 0;

        let isMouthOpen = false;

        const bird = {
            x: 50,
            y: 150,
            width: 34,
            height: 24,
            velocity: 0,
            gravity: 0.35,
            jump: -6.5,
            draw: function () {
                ctxGame.fillStyle = "#ffb000";
                ctxGame.beginPath();
                ctxGame.arc(this.x + this.width / 2, this.y + this.height / 2, this.height / 2 + 2, 0, Math.PI * 2);
                ctxGame.fill();
                ctxGame.strokeStyle = "black";
                ctxGame.lineWidth = 2;
                ctxGame.stroke();

                // Mắt
                ctxGame.fillStyle = "white";
                ctxGame.beginPath();
                ctxGame.arc(this.x + this.width / 2 + 6, this.y + this.height / 2 - 4, 6, 0, Math.PI * 2);
                ctxGame.fill();
                ctxGame.stroke();

                ctxGame.fillStyle = "black";
                ctxGame.beginPath();
                ctxGame.arc(this.x + this.width / 2 + 8, this.y + this.height / 2 - 4, 2, 0, Math.PI * 2);
                ctxGame.fill();

                // Mỏ (Há to nếu isMouthOpen)
                ctxGame.fillStyle = "red";
                ctxGame.beginPath();
                if (isMouthOpen) {
                    ctxGame.moveTo(this.x + this.width / 2 + 10, this.y + this.height / 2 + 2);
                    ctxGame.lineTo(this.x + this.width / 2 + 20, this.y + this.height / 2 - 5);
                    ctxGame.lineTo(this.x + this.width / 2 + 20, this.y + this.height / 2 + 10);
                } else {
                    ctxGame.moveTo(this.x + this.width / 2 + 10, this.y + this.height / 2);
                    ctxGame.lineTo(this.x + this.width / 2 + 20, this.y + this.height / 2 - 2);
                    ctxGame.lineTo(this.x + this.width / 2 + 20, this.y + this.height / 2 + 2);
                }
                ctxGame.fill();
                ctxGame.stroke();
            },
            update: function () {
                this.velocity += this.gravity;
                this.y += this.velocity;

                if (this.y + this.height >= gameCanvas.height) {
                    this.y = gameCanvas.height - this.height;
                    endGame();
                }
                if (this.y <= 0) {
                    this.y = 0;
                    this.velocity = 0;
                }
            },
            flap: function () {
                this.velocity = this.jump;
            }
        };

        const pipes = {
            list: [],
            width: 60,
            gap: 150,
            dx: 3.5,
            draw: function () {
                for (let i = 0; i < this.list.length; i++) {
                    let p = this.list[i];
                    // Màu ống xanh lá cây viền đen
                    ctxGame.fillStyle = "#74bf2e";
                    ctxGame.lineWidth = 3;
                    ctxGame.strokeStyle = "black";

                    // Ống trên
                    ctxGame.fillRect(p.x, 0, this.width, p.top);
                    ctxGame.strokeRect(p.x, 0, this.width, p.top);
                    ctxGame.fillRect(p.x - 5, p.top - 20, this.width + 10, 20); // Mép ống
                    ctxGame.strokeRect(p.x - 5, p.top - 20, this.width + 10, 20);

                    // Ống dưới
                    ctxGame.fillRect(p.x, gameCanvas.height - p.bottom, this.width, p.bottom);
                    ctxGame.strokeRect(p.x, gameCanvas.height - p.bottom, this.width, p.bottom);
                    ctxGame.fillRect(p.x - 5, gameCanvas.height - p.bottom, this.width + 10, 20); // Mép ống
                    ctxGame.strokeRect(p.x - 5, gameCanvas.height - p.bottom, this.width + 10, 20);
                }
            },
            update: function () {
                if (frames % 100 === 0) {
                    let minTop = 80;
                    let maxTop = gameCanvas.height - this.gap - 80;
                    let topH = Math.floor(Math.random() * (maxTop - minTop + 1) + minTop);
                    let bottomH = gameCanvas.height - topH - this.gap;

                    this.list.push({ x: gameCanvas.width, top: topH, bottom: bottomH, passed: false });
                }

                for (let i = 0; i < this.list.length; i++) {
                    let p = this.list[i];
                    p.x -= this.dx;

                    if (bird.x + bird.width > p.x && bird.x < p.x + this.width) {
                        if (bird.y < p.top || bird.y + bird.height > gameCanvas.height - p.bottom) {
                            endGame();
                        }
                    }

                    if (p.x + this.width < bird.x && !p.passed) {
                        score++;
                        scoreEl.innerText = score;
                        p.passed = true;
                    }

                    if (p.x + this.width < 0) {
                        this.list.shift();
                        i--;
                    }
                }
            }
        };

        function openGame() {
            gameOverlay.classList.remove('hidden');
            gameOverlay.classList.add('flex');
            gameCanvas.width = gameCanvas.parentElement.clientWidth;
            gameCanvas.height = gameCanvas.parentElement.clientHeight;
        }

        // THÊM SỰ KIỆN CHẠM MÀN HÌNH ĐỂ CHƠI TRÊN ĐIỆN THOẠI (DỰ PHÒNG NẾU AI LỖI)
        gameCanvas.addEventListener('touchstart', (e) => {
            if (isGameRunning) {
                bird.flap();
                e.preventDefault();
            }
        });
        gameCanvas.addEventListener('mousedown', (e) => {
            if (isGameRunning) {
                bird.flap();
            }
        });

        function closeGame() {
            gameOverlay.classList.add('hidden');
            gameOverlay.classList.remove('flex');
            isGameRunning = false;
            cancelAnimationFrame(animationId);
        }

        function startGame() {
            startScreen.classList.add('hidden');
            gameOverScreen.classList.add('hidden');
            gameCanvas.width = gameCanvas.parentElement.clientWidth;
            gameCanvas.height = gameCanvas.parentElement.clientHeight;
            bird.y = gameCanvas.height / 2;
            bird.velocity = 0;
            pipes.list = [];
            score = 0;
            scoreEl.innerText = score;
            frames = 0;
            isGameRunning = true;
            gameLoop();
        }

        function resetGame() { startGame(); }

        function endGame() {
            isGameRunning = false;
            document.getElementById('final-score').innerText = score;
            gameOverScreen.classList.remove('hidden');
            gameOverScreen.classList.add('flex');
        }

        function drawBackground() {
            ctxGame.fillStyle = "#70c5ce"; // Màu trời xanh
            ctxGame.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
            // Có thể thêm mây hoặc nhà mờ mờ ở đây
        }

        function gameLoop() {
            if (!isGameRunning) return;
            ctxGame.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

            drawBackground();
            pipes.draw();
            pipes.update();
            bird.draw();
            bird.update();

            frames++;
            animationId = requestAnimationFrame(gameLoop);
        }

        let faceMesh;
        let aiReady = false;

        async function initFaceMesh() {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return \`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/\${file}\`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            faceMesh.onResults(onFaceResults);

            try {
                await faceMesh.initialize();
                aiReady = true;
                aiLoadingText.classList.add('hidden');
                startGameBtn.classList.remove('hidden');

                // Bắt đầu vòng lặp đẩy hình ảnh Camera vào AI
                processVideoFrame();
            } catch (err) {
                console.log("Lỗi khởi tạo AI:", err);
                // Vẫn cho chơi bằng tay nếu AI lỗi
                aiLoadingText.innerText = "Camera bị chặn. Bạn vẫn có thể chạm màn hình để chơi!";
                startGameBtn.classList.remove('hidden');
            }
        }

        async function processVideoFrame() {
            if (aiReady && video.videoWidth > 0 && !video.paused) {
                try {
                    await faceMesh.send({ image: video });
                } catch (e) { }
            }
            requestAnimationFrame(processVideoFrame);
        }

        function onFaceResults(results) {
            // Vẽ người chơi góc nhỏ
            if (isGameRunning && results.image) {
                const w = 120, h = 160;
                ctxGame.save();
                ctxGame.globalAlpha = 0.8;
                ctxGame.translate(gameCanvas.width, 0);
                ctxGame.scale(-1, 1);
                ctxGame.drawImage(results.image, 10, 10, w, h);

                if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                    const landmarks = results.multiFaceLandmarks[0];
                    const topLip = landmarks[13];
                    const bottomLip = landmarks[14];

                    // Vẽ chấm đỏ vào môi để người chơi biết AI đang nhận diện được
                    ctxGame.fillStyle = "red";
                    ctxGame.beginPath();
                    ctxGame.arc(10 + topLip.x * w, 10 + topLip.y * h, 3, 0, 2 * Math.PI);
                    ctxGame.arc(10 + bottomLip.x * w, 10 + bottomLip.y * h, 3, 0, 2 * Math.PI);
                    ctxGame.fill();

                    const mouthDistance = bottomLip.y - topLip.y;

                    // Đã hạ ngưỡng từ 0.04 xuống 0.02 để nhạy hơn (há miệng nhỏ cũng bay)
                    if (mouthDistance > 0.02) {
                        if (!isMouthOpen && isGameRunning) {
                            bird.flap();
                            isMouthOpen = true;
                        }
                    } else {
                        isMouthOpen = false;
                    }
                }

                // Vẽ khung viền trắng
                ctxGame.lineWidth = 3;
                ctxGame.strokeStyle = "white";
                ctxGame.strokeRect(10, 10, w, h);
                ctxGame.restore();
            }
        }

        // ==========================================
        // KHỞI CHẠY APP
        // ==========================================
        window.onload = () => {
            initCamera().then(() => {
                initFaceMesh();
            });
            checkAuth(); // Kiểm tra đăng nhập và tải bài viết
            setTimeout(handleAddFriendUrlParam, 500); // Tự động xử lý kết bạn qua link sau khi load
        };
    </script>
</body>

</html>`;

app.get('/', (req, res) => {
    res.send(HTML_CONTENT);
});
