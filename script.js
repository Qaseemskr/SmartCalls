
        let uploadedPhotoData = null;
        let userName = '';
        let currentSubject = '';
        let map;
        let schoolMarkers = [];

        // School data for Jigawa State
        const schools = [
            { name: "Federal University Dutse", latitude: 11.0881, longitude: 9.3242, type: "University" },
            { name: "Sule Lamido University", latitude: 12.4878, longitude: 9.6166, type: "University" },
            { name: "Rabaza College of Education", latitude: 12.1500, longitude: 10.2167, type: "College" },
            { name: "Jigawa State College of Education", latitude: 11.8500, longitude: 9.2833, type: "College" },
            { name: "Hadejia Institute of Agriculture", latitude: 12.6833, longitude: 10.0500, type: "Institute" },
            { name: "Kazaure Institute of Technology", latitude: 12.7833, longitude: 8.2833, type: "Institute" },
            { name: "Dutse Capital School", latitude: 11.0931, longitude: 9.3297, type: "Secondary School" },
            { name: "Government Science and Technical College Kazaure", latitude: 12.7885, longitude: 8.2858, type: "Technical College" },
            { name: "Government Girls Secondary School, Dutse", latitude: 11.0803, longitude: 9.3206, type: "Secondary School" },
            { name: "Federal Government College, Dutse", latitude: 11.1015, longitude: 9.3162, type: "Secondary School" },
        ];

        function showLogin() {
            document.getElementById('welcome').style.display = 'none';
            document.getElementById('login').style.display = 'block';
            document.getElementById('signup').style.display = 'none';
        }

        function showSignUp() {
            document.getElementById('welcome').style.display = 'none';
            document.getElementById('signup').style.display = 'block';
            document.getElementById('login').style.display = 'none';
        }

        function goToLanguageSelection() {
            const fileInput = document.getElementById('uploadPhoto');
            const nameInput = document.getElementById('fullName');
            userName = nameInput ? nameInput.value : '';
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    uploadedPhotoData = e.target.result;
                };
                reader.readAsDataURL(fileInput.files[0]);
            }

            document.getElementById('signup').style.display = 'none';
            document.getElementById('login').style.display = 'none';
            document.getElementById('language').style.display = 'block';
            document.getElementById('welcome').style.display = 'none';
        }

        function goToHome(language) {
            document.getElementById('language').style.display = 'none';
            document.getElementById('home').style.display = 'block';
            document.getElementById('welcome').style.display = 'none';

            if (uploadedPhotoData) {
                setUserPhoto(uploadedPhotoData);
            }
            if (userName) {
                document.getElementById('userName').innerText = userName;
            }

            updateUserScoreDisplay();
        }

        function setUserPhoto(url) {
            document.getElementById("profilePic").src = url;
        }

        function openSubjectPage(subjectKey) {
            currentSubject = subjectKey;
            document.getElementById('home').style.display = 'none';
            document.getElementById('subjectPage').style.display = 'block';

            let title = '',
                content = '';

            if (subjectKey === 'Current Affairs') {
                title = 'Current Affairs - Jigawa State';
                content = `
          <p><b><center>Welcome to Current affairs page for Jigawa State The New World</center></b><br>.</p>
          <p><strong>About Jigawa State</strong><br>

<i>Jigawa State, created on August 27, 1991, is located in northwestern Nigeria with Dutse as its capital. It shares borders with Kano, Katsina, Bauchi, Yobe, and the Republic of Niger. The state has 27 Local Government Areas and is known for its flat savannah landscape and semi-arid climate.

Agriculture is the backbone of its economy, with crops like millet, rice, and groundnuts, alongside livestock farming. The major ethnic groups are Hausa and Fulani, and Islam is the predominant religion. Hausa and Fulfulde are widely spoken, with English as the official language.

Jigawa is home to the Federal University Dutse and other educational institutions. Notable attractions include the Birnin Kudu Rock Paintings and the Hadejia-Nguru Wetlands. The state continues to grow through investments in education, infrastructure, and rural development</i>.</p>
          <ul>
            <li><b>Creation Date:</b>       August 27, 1991</li>
            <li><b>State Creator:</b>       General Ibrahim Babangida</li>
            <li><b>Geopolitical Zone:</b>       North-West</li>
            <li><b>State Capital:</b>       Dutse</li>
            <li><b>State Slogan:</b>        The New World</li>
            <li><b>Population:</b>      5,528,163</li>
            <li><b>Land Area:</b>       23,154 sq. km</li>
            <li><b>Local Governments:</b>       27</li>
            <li><b>Governor:</b>        Umar Namadi</li>
          </ul>
        `;
                document.getElementById('takeQuizBtn').style.display = 'inline-block';
            } else if (subjectKey === 'Space Technology') {
                title = 'Space Technology';
                content = `<p>Content for Space Technology will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            } else if (subjectKey === 'Climate Education') {
                title = 'Climate Education';
                content = `<p>Content for Climate Education will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            } else if (subjectKey === 'Islamic Studies') {
                title = 'Islamic Studies';
                content = `<p>Content for Islamic Studies will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            } else if (subjectKey === 'Agriculture') {
                title = 'Agriculture';
                content = `<p>Content for Agriculture will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            } else if (subjectKey === 'Science') {
                title = 'Science';
                content = `<p>Content for Science will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            } else if (subjectKey === 'Online Classrooms') {
                title = 'Online Classrooms';
                content = `<p>Content for Online Classrooms will be added here later.</p>`;
                document.getElementById('takeQuizBtn').style.display = 'none';
            }

            document.getElementById('subjectTitle').innerHTML = title;
            document.getElementById('subjectContent').innerHTML = content;
        }

        function openQuizPage() {
            document.getElementById('subjectPage').style.display = 'none';
            document.getElementById('quizPage').style.display = 'block';
        }

        function goBackToSubject() {
            document.getElementById('quizPage').style.display = 'none';
            document.getElementById('subjectPage').style.display = 'block';
        }

        function goBackToHome() {
            document.getElementById('subjectPage').style.display = 'none';
            document.getElementById('home').style.display = 'block';
        }

        function submitQuiz() {
            const answers = {
                q1: "B",
                q2: "A",
                q3: "D",
                q4: "B"
            };

            let score = 0;
            for (let q in answers) {
                const selected = document.querySelector(`input[name="${q}"]:checked`);
                if (selected && selected.value === answers[q]) {
                    score += 20;
                }
            }

            let previousScore = parseInt(localStorage.getItem("userScore") || "0");
            let newScore = previousScore + score;

            localStorage.setItem("userScore", newScore);
            document.getElementById("quizResult").innerText = "Your score: " + score + " out of 80";
        }

        function updateUserScoreDisplay() {
            const score = localStorage.getItem("userScore") || 0;
            document.getElementById("scoreTracker").innerText = "Score: " + score;
        }

        function openMap() {
            document.getElementById('home').style.display = 'none';
            document.getElementById('mapContainer').style.display = 'block';

            if (!map) {
                // Initialize the map
                map = L.map('map').setView([12.5000, 9.5000], 8); // Centered on Jigawa State, zoom level 8
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);

                // Add markers for schools
                addSchoolMarkers();
            } else {
                // Clear existing markers
                schoolMarkers.forEach(marker => map.removeLayer(marker));
                schoolMarkers = [];

                // Add markers again
                addSchoolMarkers();
            }
        }

        function addSchoolMarkers() {
            schools.forEach(school => {
                const marker = L.marker([school.latitude, school.longitude])
                    .bindPopup(`<b>${school.name}</b><br>Type: ${school.type}`)
                    .addTo(map);
                schoolMarkers.push(marker);
            });
        }
    