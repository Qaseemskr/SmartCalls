    <script>
        // --- GLOBAL CONFIGURATION (MUST UPDATE) ---
        // REPLACE THIS WITH YOUR DEPLOYED RENDER BACKEND URL!
        const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com"; 

        // --- Global State ---
        let isDarkTheme = false;
        let currentPage = 'homePage';
        let currentCallData = null; // Stores data for the active call
        let callActive = false;
        
        // --- UI Element References ---
        const loader = document.getElementById('loader');
        const mainAppPage = document.getElementById('mainAppPage');
        const callScreen = document.getElementById('callScreen');
        const dialpadOverlay = document.getElementById('dialpadOverlay');
        const dialedNumberInput = document.getElementById('dialedNumber');
        const callStatus = document.getElementById('callStatus');
        const calleeNameDisplay = document.getElementById('calleeName');
        const recentCallsList = document.getElementById('recentCallsList');

        // --- LOADER & ALERT FUNCTIONS ---
        function showLoader() { loader.classList.add('show'); }
        function hideLoader() {
            setTimeout(() => {
                loader.classList.remove('show');
            }, 300);
        }

        function showAlert(message) {
            const dialog = document.getElementById('customAlertDialog');
            document.getElementById('customAlertMessage').textContent = message;
            dialog.style.display = 'flex';
        }

        function hideCustomAlert() {
            document.getElementById('customAlertDialog').style.display = 'none';
        }

        // --- Theme Toggle Function ---
        function toggleTheme() {
            isDarkTheme = !isDarkTheme;
            document.body.classList.toggle('dark-theme', isDarkTheme);
            const themeIcon = document.querySelector('#themeToggleButton i');
            themeIcon.classList.toggle('fa-sun', !isDarkTheme);
            themeIcon.classList.toggle('fa-moon', isDarkTheme);
            localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
        }

        // --- Navigation ---
        function navigate(pageId) {
            if (callActive) {
                showAlert("Please end the current call before navigating.");
                return;
            }

            // Hide all pages
            ['homePage', 'contactsPage', 'profilePage'].forEach(id => {
                const page = document.getElementById(id);
                if (page) page.classList.add('hidden');
            });

            // Show target page
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                currentPage = pageId;
            }

            // Update navigation bar active state
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            if (pageId === 'homePage') document.getElementById('navHome').classList.add('active');
            if (pageId === 'contactsPage') document.getElementById('navContacts').classList.add('active');
            
            // Clean up when leaving pages (e.g., dialpad number)
            dialedNumberInput.value = '+';
        }


        // --- DIALPAD LOGIC ---
        function showDialpad() {
            dialpadOverlay.classList.add('show');
        }

        function hideDialpad() {
            dialpadOverlay.classList.remove('show');
        }

        function dialInput(key) {
            let currentValue = dialedNumberInput.value.trim();

            if (key === '+' && currentValue.includes('+')) {
                // Only allow one leading '+'
                return;
            }
            if (key === '+') {
                // Ensure '+' is at the start
                dialedNumberInput.value = '+' + currentValue.replace('+', '').trim();
                return;
            }

            // Ensure '+' is only entered once, and only at the start
            if (currentValue === '+' && key.match(/[a-zA-Z]/)) {
                // Ignore text input if only '+' is present
                return;
            }
            
            // Allow numbers and '#'
            if (key.match(/^[0-9#]$/)) {
                dialedNumberInput.value += key;
            }
        }

        function deleteDialInput() {
            let currentValue = dialedNumberInput.value;
            dialedNumberInput.value = currentValue.substring(0, currentValue.length - 1);
        }

        // --- CALLING LOGIC (REAL IMPLEMENTATION) ---
        
        // Helper to format the number
        function formatNumberForCall(number) {
            // Remove spaces, ensure it starts with '+'
            let cleaned = number.replace(/\s/g, '');
            if (!cleaned.startsWith('+')) {
                // Assuming it's a local number if no plus is provided, prepend a default country code if needed, 
                // but for international apps, forcing '+' is safer.
                return cleaned; // Let the backend handle validation
            }
            return cleaned;
        }

        function makeCallFromDialpad() {
            const number = dialedNumberInput.value.trim();
            makeRealCall(number, number); // Use the number as the name for the dialpad call
        }

        // This is the core function to call your Render backend
        async function makeRealCall(number, name) {
            const formattedNumber = formatNumberForCall(number);
            
            if (formattedNumber.length < 5) {
                showAlert("Please enter a valid number (including country code) to call.");
                return;
            }

            showLoader();
            hideDialpad(); // Hide dialpad immediately upon call attempt

            try {
                // 1. Show Call Screen UI
                currentCallData = { number: formattedNumber, name: name };
                callActive = true;
                mainAppPage.classList.add('hidden');
                callScreen.classList.remove('hidden');
                calleeNameDisplay.textContent = name;
                callStatus.textContent = "Initiating Call...";

                // 2. Call Backend API
                const response = await fetch(`${BACKEND_URL}/startCall`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ to: formattedNumber })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    callStatus.textContent = "Calling...";
                    showAlert(`Call successfully initiated to ${name} (${formattedNumber}). The Africa's Talking service is handling the connection.`);
                    // NOTE: Since the AT API only initiates the call, the UI will need manual end/status update.
                    // In a production app, you would use AT Webhooks to update the call status in real-time.
                } else {
                    // Call failed at the backend/AT level
                    throw new Error(data.details || data.error || "Unknown API error.");
                }

            } catch (error) {
                console.error("Real Call Error:", error);
                callStatus.textContent = "Call Failed!";
                showAlert(`Failed to start call to ${name}. Error: ${error.message}. Please check your number and the backend URL/status.`);
                
                // Immediately end the simulated call UI on error
                endCall(true); 

            } finally {
                hideLoader();
                // Add to recent calls (even if failed)
                addToRecentCalls(formattedNumber, name, callStatus.textContent);
            }
        }

        function endCall(isError = false) {
            if (!callActive) return;

            // In a real app, you would send a request to AT to hang up the call
            // For now, we update the UI status and clear data
            
            if (!isError) {
                showAlert(`Call with ${currentCallData.name} ended.`);
            }

            callActive = false;
            currentCallData = null;
            
            // Reset UI
            callScreen.classList.add('hidden');
            mainAppPage.classList.remove('hidden');
            callStatus.textContent = "Connecting..."; // Reset status
            calleeNameDisplay.textContent = "";

            // Navigate back to the page that was active before the call (e.g. home)
            navigate(currentPage);
        }

        function toggleMute() {
            const btn = document.getElementById('muteBtn');
            btn.classList.toggle('bg-red-600');
            btn.classList.toggle('bg-gray-600');
            btn.querySelector('i').classList.toggle('fa-microphone-slash');
            btn.querySelector('i').classList.toggle('fa-microphone');
            showAlert(`Mute is now ${btn.classList.contains('bg-red-600') ? 'ON' : 'OFF'}. (Simulation)`);
        }

        function toggleSpeaker() {
            const btn = document.getElementById('speakerBtn');
            btn.classList.toggle('bg-green-600');
            btn.classList.toggle('bg-gray-600');
            showAlert(`Speaker is now ${btn.classList.contains('bg-green-600') ? 'ON' : 'OFF'}. (Simulation)`);
        }
        
        // --- RECENT CALLS LOGIC ---
        function addToRecentCalls(number, name, status) {
            const time = new Date().toLocaleTimeString();
            const date = new Date().toLocaleDateString();

            const historyItem = document.createElement('div');
            historyItem.className = 'history-item contact-item';
            
            historyItem.innerHTML = `
                <div>
                    <p class="font-semibold">${name}</p>
                    <p class="text-sm text-gray-500">${number} - <span class="${status.includes('Failed') ? 'text-red-500' : 'text-green-500'}">${status}</span></p>
                    <p class="text-xs text-gray-400">${date} at ${time}</p>
                </div>
                <button class="call-action-btn" onclick="makeRealCall('${number}', '${name}')" aria-label="Call Again">
                    <i class="fas fa-phone"></i>
                </button>
            `;
            
            // Remove placeholder if present
            const placeholder = recentCallsList.querySelector('p.text-sm');
            if(placeholder) {
                placeholder.remove();
            }

            // Add the new item to the top of the list
            recentCallsList.prepend(historyItem);
        }


        // --- ON PAGE LOAD ---
        document.addEventListener('DOMContentLoaded', () => {
            // Apply saved theme preference
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                toggleTheme(); // will set isDarkTheme = true
            }

            // Set initial page
            navigate('homePage');
            
            // Initial focus for responsive design (optional)
            window.addEventListener('resize', () => {
                 // Nothing needed here currently, as tailwind handles most of the layout
            });

            hideLoader();
        });

    </script>