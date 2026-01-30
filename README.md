```markdown
# 🎧 VibeAudio

**Experience Books Like Never Before.** A modern, lightweight, and immersive free audiobook platform built for the web.

![VibeAudio Banner] 


---

## ⚡ Introduction

**VibeAudio** is a cloud-first audiobook streaming app designed to provide a premium listening experience for free. It features a stunning glassmorphism UI, dynamic theming that adapts to book covers, and real-time cloud sync to keep your progress updated across devices.

We believe in keeping things simple: **No Bloatware, Just Vibes.**

---

## 🚀 Key Features

- **☁️ Cloud Sync:** Your listening progress is automatically saved to the cloud. Start on your laptop, finish on your phone.
- **🎨 Chameleon Theme:** The UI dynamically changes colors based on the audiobook cover art (powered by *Color Thief*).
- **🔒 Secure Auth:** Seamless and secure login using **Clerk Authentication**.
- **🎧 Advanced Player:**
  - Variable Playback Speed (0.5x - 2.0x).
  - Sleep Timer.
  - Smart Seek & Chapter Navigation.
- **📂 Curated Library:** Filter books by mood, genre, or trending status.
- **📱 Responsive Design:** A fully responsive glass-morphism interface that looks great on any screen.
- **💬 Vibe Check:** Leave timestamped comments on specific parts of audiobooks.

---

## 🛠️ Tech Stack

### **Frontend (The Beauty)**
- **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Animations:** GSAP (GreenSock Animation Platform).
- **Styling:** CSS Variables, Glassmorphism, FontAwesome 6.
- **Auth:** Clerk SDK.
- **Utilities:** Vanilla-Tilt.js (3D effects), Color Thief (Theming).

### **Backend (The Brains)**
- **Cloud:** AWS Lambda (Serverless Functions).
- **Database:** AWS DynamoDB (NoSQL for speed).
- **API:** RESTful endpoints for books and user progress.
- **Environment:** Node.js.

---

## 📂 Project Structure

```bash
VibeAudio/
├── backend/              # Serverless Backend Code
│   ├── lambda/           # AWS Lambda Functions (Auth, GetBooks, Sync)
│   └── package.json      # Backend Dependencies
├── books_data/           # JSON Data for Audiobooks
├── frontend/             # The User Interface
│   ├── public/           # Static Assets
│   ├── src/
│   │   ├── css/          # Modular Styles (base, components, player)
│   │   ├── js/           # Core Logic (api, player, ui)
│   │   └── pages/        # App HTML Views
│   └── index.html        # Landing / Login Page
└── README.md             # You are here!

```

---

## 🏁 Getting Started

Follow these steps to run VibeAudio locally on your machine.

### Prerequisites

* Node.js installed.
* A free **Clerk** account (for Auth keys).
* AWS Credentials (if running backend locally).

### 1. Clone the Repository

```bash
git clone [https://github.com/naveenamre/VibeAudio.git](https://github.com/naveenamre/VibeAudio.git)
cd VibeAudio

```

### 2. Frontend Setup

Simply serve the `frontend` folder using any local server (like Live Server in VS Code).

* Open `frontend/index.html` in your browser.
* **Note:** Update the Clerk Publishable Key in `index.html` and `app.html` with your own keys.

### 3. Backend Setup (Optional)

If you want to modify the backend:

```bash
cd backend
npm install
# Configure your .env file with AWS credentials

```

---

## 🔮 Future Roadmap

* [ ] **Native Android App:** A full-fledged mobile app (Java/Kotlin) utilizing the same robust API.
* [ ] **Offline Mode:** Download books for offline listening (App exclusive).
* [ ] **Social Features:** Share your favorite book quotes directly to Instagram/Twitter.
* [ ] **Voice Commands:** Control the player with your voice.

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

### 👨‍💻 Author

**Naveen Amre** *Code, Vibe, Repeat.*

---

```
