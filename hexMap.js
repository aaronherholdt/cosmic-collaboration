document.addEventListener('DOMContentLoaded', () => {
    // Screen management
    const loginScreen = document.getElementById('loginScreen');
    const waitingRoomScreen = document.getElementById('waitingRoomScreen');
    const gameScreen = document.getElementById('gameScreen');
    
    // Login elements
    const playerNameInput = document.getElementById('playerNameInput');
    const joinGameBtn = document.getElementById('joinGameBtn');
    const rocketOptions = document.querySelectorAll('.rocket-option');
    
    // Waiting room elements
    const playerList = document.getElementById('playerList');
    const startGameBtn = document.getElementById('startGameBtn');
    
    // Ping system
    const togglePingBtn = document.getElementById('togglePingBtn');
    let isPingingActive = false;
    const pings = [];
    
    // Socket.io connection
    let socket;
    let isConnected = false;
    
    // Player data
    let currentPlayerId = '';
    let currentPlayerName = '';
    let selectedRocketType = 'blue'; // Default rocket
    let players = {}; // Keep as an object to match server-side structure
    let isHost = false; // First player becomes host
    
    // Galactic Hub data
    let hubGoals = {
        energy: { current: 0, target: 500, color: '#FF5252', moduleThresholds: [0.25, 0.5, 0.75, 1.0] },
        water: { current: 0, target: 200, color: '#4682B4', moduleThresholds: [0.25, 0.5, 0.75, 1.0] },
        organic: { current: 0, target: 300, color: '#4CAF50', moduleThresholds: [0.25, 0.5, 0.75, 1.0] },
        mineral: { current: 0, target: 400, color: '#FFD700', moduleThresholds: [0.25, 0.5, 0.75, 1.0] }
    };
    
    const galacticHub = {
        requiredResources: {
            energy: hubGoals.energy.target,
            water: hubGoals.water.target,
            organic: hubGoals.organic.target,
            mineral: hubGoals.mineral.target
        },
        contributedResources: {
            energy: 0,
            water: 0,
            organic: 0,
            mineral: 0
        },
        completed: false
    };
    
    // Resource specializations based on rocket type
    const rocketSpecializations = {
        red: 'energy',
        blue: 'water',
        green: 'organic',
        yellow: 'mineral'
    };
    
    // Initialize Socket.io connection
    function initializeSocketConnection() {
        // Connect to the server using the current URL
        socket = io('https://cosmic-collaboration.onrender.com', {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });
        
        // Display loading indicator
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'system-notification';
        loadingMsg.textContent = 'Connecting to server...';
        document.body.appendChild(loadingMsg);

        socket.on('connect', () => {
            console.log('Connected to server!');
            loadingMsg.textContent = 'Connected!';
            setTimeout(() => {
                if (loadingMsg.parentNode) {
                    loadingMsg.parentNode.removeChild(loadingMsg);
                }
            }, 2000);
            updateStartButton(); // Call after connection to ensure UI reflects host status
        });
        
        // Add game state handler
        socket.on('gameState', (state) => {
            console.log('Received game state:', state);
            
            // Update players from server state
            if (state.players) {
                // Clear existing players and add from server state
                players = {};
                
                // Add each player from the state
                Object.entries(state.players).forEach(([id, playerData]) => {
                    players[id] = playerData;
                    
                    // Update local player info if this is us
                    if (id === socket.id) {
                        isHost = playerData.isHost;
                        currentPlayerId = id;
                        currentPlayerName = playerData.name;
                        selectedRocketType = playerData.rocketType;
                    }
                });
                
                // Update UI
                updatePlayerList();
                updateStartButton();
            }
            
            // Handle other game state updates here if needed
            // For example, hub progress, star systems, etc.
        });

        socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            
            // Update local player data if this is us
            if (data.id === socket.id) {
                isHost = data.isHost;
                currentPlayerId = data.id;
                currentPlayerName = data.name;
                selectedRocketType = data.rocketType;
                showSystemMessage(`You joined as ${data.isHost ? 'host' : 'player'}`);
            } else {
                showSystemMessage(`${data.name} joined the game`);
            }
            
            // Add player to local players object
            addPlayer(data.id, data.name, data.isHost, data.rocketType);
            updateStartButton();
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            loadingMsg.textContent = 'Connection error! Please refresh.';
            // Simulation fallback removed
        });

        // Handle game state from server
        socket.on('gameState', (state) => {
            // Update your game with the server state
            console.log('Received game state:', state);
            
            // Clear simulated players if any
            otherPlayers = {};
            
            // Add all current players from the server
            if (state.players) {
                Object.keys(state.players).forEach(playerId => {
                    if (playerId !== socket.id) {
                        const p = state.players[playerId];
                        // Make sure we create the player first
                        addPlayer(playerId, p.name, p.isHost, p.rocketType);
                        
                        // THEN update positions if available (only after player is created)
                        if (p.position && otherPlayers[playerId]) {
                            otherPlayers[playerId].x = p.position.x || 0;
                            otherPlayers[playerId].y = p.position.y || 0;
                            otherPlayers[playerId].targetX = p.position.x || 0;
                            otherPlayers[playerId].targetY = p.position.y || 0;
                        }
                    }
                });
            } else {
                console.warn('Received game state without players property');
            }
            
            // Update the player list UI
            updatePlayerList();
        });

        // Handle new player joined
        socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            showSystemMessage(`${data.name} joined the game!`);
            
            // Don't add ourselves again
            if (data.id !== socket.id) {
                addPlayer(data.id, data.name, data.isHost, data.rocketType);
                updatePlayerList();
            }
        });

        // Handle player left
        socket.on('playerLeft', (data) => {
            console.log('Player left:', data);
            showSystemMessage(`${data.name} left the game`);
            
            // Use the removePlayer function to properly handle player removal
            removePlayer(data.id);
            // updatePlayerList is called inside removePlayer
            updateStartButton();
        });

        // Handle other player movement
        socket.on('playerMoved', (data) => {
            if (otherPlayers[data.id]) {
                otherPlayers[data.id].targetX = data.position.x;
                otherPlayers[data.id].targetY = data.position.y;
                otherPlayers[data.id].isMoving = true;
            }
        });

        // Other socket event handlers...
    }
    
    // Simulate socket connection for demo
    function simulateSocketConnection() {
        isConnected = true;
        currentPlayerId = 'player_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Set up rocket selection
    rocketOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            rocketOptions.forEach(opt => opt.classList.remove('selected'));
            // Add selected class to clicked option
            option.classList.add('selected');
            // Store selected rocket type
            selectedRocketType = option.getAttribute('data-rocket');
        });
    });
    
    // Select the default rocket
    document.querySelector(`.rocket-option[data-rocket="${selectedRocketType}"]`).classList.add('selected');
    
    // Event listeners for login and waiting room
    joinGameBtn.addEventListener('click', handleJoinGame);
    playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleJoinGame();
        }
    });
    startGameBtn.addEventListener('click', startGame);
    
    // Ping system
    togglePingBtn.addEventListener('click', togglePingMode);
    
    // Initialize socket connection
    initializeSocketConnection();
    
    // Handle joining the game
    function handleJoinGame() {
        const name = playerNameInput.value.trim();
        if (name.length < 2) {
            alert('Please enter a name with at least 2 characters');
            return;
        }
        
        currentPlayerName = name;
        
        // Only use socket.id as the player ID when connected
        if (socket && socket.connected) {
            currentPlayerId = socket.id;
            
            // Initialize player position before adding to players object
            player.x = galaxyCenterX + (Math.random() - 0.5) * galaxyRadius * 0.5;
            player.y = galaxyCenterY + (Math.random() - 0.5) * galaxyRadius * 0.5;
            player.targetX = player.x;
            player.targetY = player.y;
            player.rotation = 0;
            player.isMoving = false;
            player.rocketType = selectedRocketType;
            player.name = name;
            player.visible = true; // Make sure player is visible
            
            // Ensure we have a local player entry in the players object
            players[currentPlayerId] = {
                id: currentPlayerId,
                name: name,
                isHost: false, // Server will set this correctly
                rocketType: selectedRocketType,
                x: player.x,
                y: player.y,
                targetX: player.x,
                targetY: player.y,
                rotation: 0,
                isMoving: false,
                visible: true // Explicitly set visibility
            };
            
            // Set the currentPlayer reference to the player in the players object
            currentPlayer = players[currentPlayerId];
            
            console.log(`Joining game with name: ${name}, rocket: ${selectedRocketType}`);
            console.log("Player initialized at position:", player.x, player.y);
            console.log("currentPlayer reference set:", currentPlayer);
            
            // Emit join game event to server
            socket.emit('joinGame', {
                playerName: name,
                rocketType: selectedRocketType,
                position: {
                    x: player.x,
                    y: player.y
                }
            });
            
            // Switch to waiting room screen
            switchScreen('loginScreen', 'waitingRoomScreen');
            
            // The player list will be updated when the server sends back the player data
        } else {
            // Fallback for offline testing - create a simulated player ID
            currentPlayerId = 'local-' + Date.now();
            
            // Initialize player position
            player.x = galaxyCenterX + (Math.random() - 0.5) * galaxyRadius * 0.5;
            player.y = galaxyCenterY + (Math.random() - 0.5) * galaxyRadius * 0.5;
            player.targetX = player.x;
            player.targetY = player.y;
            player.rotation = 0;
            player.isMoving = false;
            player.rocketType = selectedRocketType;
            player.name = name;
            player.visible = true;
            
            // Add to players object
            players[currentPlayerId] = {
                id: currentPlayerId,
                name: name,
                isHost: true, // Local player is host in offline mode
                rocketType: selectedRocketType,
                x: player.x,
                y: player.y,
                targetX: player.x,
                targetY: player.y,
                rotation: 0,
                isMoving: false,
                visible: true // Explicitly set visibility
            };
            
            // Set the currentPlayer reference to the player in the players object
            currentPlayer = players[currentPlayerId];
            
            console.log(`Joining offline game with name: ${name}, rocket: ${selectedRocketType}`);
            console.log("Player initialized at position:", player.x, player.y);
            console.log("currentPlayer reference set:", currentPlayer);
            
            // Switch to waiting room screen
            switchScreen('loginScreen', 'waitingRoomScreen');
            
            // For offline testing, simulate other players
            simulateSocketConnection();
        }
        
        // Debug - force a redraw to see if player appears
        setTimeout(() => {
            console.log("Forcing redraw after join...");
            drawPlayers();
        }, 1000);
    }
    
    
    // Add a player to the list
    function addPlayer(id, name, isPlayerHost = false, rocketType) {
        // Add player to the players object if they don't exist yet
        if (!players[id]) {
            players[id] = {
                id: id,
                name: name,
                isHost: isPlayerHost,
                rocketType: rocketType,
                x: 0,
                y: 0,
                targetX: 0,
                targetY: 0,
                rotation: 0,
                isMoving: false,
                visible: true // Explicitly set visibility
            };
            
            console.log(`Player added: ${name} (${id}), rocket: ${rocketType}`);
        }
        
        // If this is the current player, set the currentPlayer reference
        if (id === currentPlayerId) {
            currentPlayer = players[id];
            console.log("Current player reference set:", currentPlayer);
            
            // If current player doesn't have a position yet, initialize it
            if (currentPlayer.x === 0 && currentPlayer.y === 0) {
                currentPlayer.x = galaxyCenterX + (Math.random() - 0.5) * galaxyRadius * 0.5;
                currentPlayer.y = galaxyCenterY + (Math.random() - 0.5) * galaxyRadius * 0.5;
                currentPlayer.targetX = currentPlayer.x;
                currentPlayer.targetY = currentPlayer.y;
                
                // Sync with player object (if different from currentPlayer)
                if (player) {
                    player.x = currentPlayer.x;
                    player.y = currentPlayer.y;
                    player.targetX = currentPlayer.x;
                    player.targetY = currentPlayer.y;
                }
                
                console.log("Initialized current player position:", currentPlayer.x, currentPlayer.y);
            }
        }
        
        // Update the player list in the UI
        updatePlayerList();
        
        // Debug - log all players
        console.log(`Total players: ${Object.keys(players).length}`);
    }
    
    // Remove a player from the list
    function removePlayer(id) {
        if (players[id]) {
            console.log(`Player removed: ${players[id].name} (${id})`);
            delete players[id];
            updatePlayerList();
        }
    }
    
    // Update the player list in the UI
    function updatePlayerList() {
        playerList.innerHTML = '';
        
        Object.values(players).forEach(player => { // Use Object.values to iterate over players
            const li = document.createElement('li');
            
            // Create rocket icon
            const rocketIcon = document.createElement('div');
            rocketIcon.className = `player-rocket-icon rocket-${player.rocketType}`;
            li.appendChild(rocketIcon);
            
            // Create player info div
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            
            // Add player name
            const playerName = document.createElement('span');
            playerName.className = 'player-name-item';
            playerName.textContent = player.name;
            
            if (player.isHost) {
                playerName.textContent += ' (Host)';
                playerName.style.color = '#FFD700';
            }
            
            if (player.id === currentPlayerId) {
                playerName.style.fontWeight = 'bold';
            }
            
            playerInfo.appendChild(playerName);
            
            // Add rocket type and specialization
            const rocketType = document.createElement('span');
            rocketType.className = 'player-rocket-type';
            const specialization = rocketSpecializations[player.rocketType];
            rocketType.textContent = `${player.rocketType.charAt(0).toUpperCase() + player.rocketType.slice(1)} Rocket (${specialization})`;
            playerInfo.appendChild(rocketType);
            
            li.appendChild(playerInfo);
            playerList.appendChild(li);
        });
    }
    
    // Start the game
    function startGame() {
        if (isHost && socket && socket.connected) {
            socket.emit('startGame');
        }
        // Simulation mode removed
    }

    // Add socket event listener for game start
    if (socket) {
        socket.on('startGame', () => {
            handleGameStart();
        });
    }

    function handleGameStart() {
        gameStarted = true;
        switchScreen('waitingRoomScreen', 'gameScreen');
        initializeGameComponents();
    }

    function initializeGameComponents() {
        initializeGalaxy();
        initializeHubProgress();
        initializeCosmicNexusCore();
        enhanceResponsiveLayout();
        initializePlayerPosition();
        setupControlButtons();
        setupTabletLayout();
        setupTouchControls();
        animationLoop();
    }
    
    // Fix the switchScreen function to handle missing elements
    function switchScreen(fromScreen, toScreen) {
        // Safely get elements and check if they exist
        const fromElement = document.getElementById(fromScreen);
        const toElement = document.getElementById(toScreen);
        
        // Only try to remove class if element exists
        if (fromElement) {
            fromElement.classList.remove('active');
        } else {
            console.warn(`Screen element with ID "${fromScreen}" not found`);
        }
        
        // Only try to add class if element exists
        if (toElement) {
            toElement.classList.add('active');
        } else {
            console.error(`Screen element with ID "${toScreen}" not found`);
            // If target screen wasn't found, this is a critical error
            // Try to show a helpful message to the user
            showSystemMessage("Error switching screens. Please refresh the page.");
        }
    }
    
    // Initialize the Galactic Hub progress display
    function initializeHubProgress() {
        const resourceGoalsDiv = document.getElementById('resourceGoals');
        resourceGoalsDiv.innerHTML = '';

        for (const [resourceType, goal] of Object.entries(hubGoals)) {
            const resourceGoalDiv = document.createElement('div');
            resourceGoalDiv.className = 'resource-goal';
            resourceGoalDiv.innerHTML = `
                <div class="resource-goal-label">
                    <span>${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}</span>
                    <span id="${resourceType}-progress">${goal.current}/${goal.target}</span>
                </div>
                <div class="resource-goal-progress">
                    <div class="resource-goal-bar" id="${resourceType}-bar" style="width: 0%; background-color: ${goal.color};"></div>
                </div>
            `;
            resourceGoalsDiv.appendChild(resourceGoalDiv);
        }

        playerContributions = {};
        updatePlayerContributionsDisplay();
        resetHubModules();
        
        // Add the collaboration panel toggle for small screens
        const gameScreen = document.getElementById('gameScreen');
        if (!document.getElementById('toggleCollaborationPanel')) {
            gameScreen.insertAdjacentHTML('beforeend', toggleButtonHTML);
            document.getElementById('toggleCollaborationPanel').addEventListener('click', toggleCollaborationPanel);
        }
        
        // Add control overlay for all devices
        if (!document.getElementById('controlsOverlay')) {
            gameScreen.insertAdjacentHTML('beforeend', controlsOverlayHTML);
            setupControlButtons();
        }
        
        // Detect touch devices
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            document.body.classList.add('touch-device');
            setupTouchControls();
        }
    }
    
    // Track player contributions
    let playerContributions = {};
    
    // Update the contributeToHub function to track individual contributions
    function contributeToHub(resourceType, amount) {
        if (!hubGoals[resourceType]) return false;

        const currentPlayer = players[currentPlayerId];
        if (!currentPlayer) {
            console.error(`Current player not found for ID: ${currentPlayerId}`);
            // Fallback: Create a temporary player entry if missing
            players[currentPlayerId] = {
                id: currentPlayerId,
                name: currentPlayerName,
                isHost: isHost,
                rocketType: selectedRocketType,
                contributions: {}
            };
        }

        // Proceed with contribution
        hubGoals[resourceType].current = Math.min(hubGoals[resourceType].target, hubGoals[resourceType].current + amount);
        galacticHub.contributedResources[resourceType] += amount;
        
        if (!players[currentPlayerId].contributions) {
            players[currentPlayerId].contributions = {};
        }
        if (!players[currentPlayerId].contributions[resourceType]) {
            players[currentPlayerId].contributions[resourceType] = 0;
        }
        players[currentPlayerId].contributions[resourceType] += amount;

        console.log(`Contributing ${amount} ${resourceType}. New total: ${hubGoals[resourceType].current}/${hubGoals[resourceType].target}`);
        
        updateHubProgress();
        updatePlayerContributionsDisplay();
        updateCollaborationPanel();
        showSystemMessage(`${currentPlayerName} contributed ${amount} ${resourceType} to the Galactic Hub!`);
        checkHubCompletion();

        return true;
    }
    
    // Function to update the player contributions display
    function updatePlayerContributionsDisplay() {
        const contributionsDiv = document.getElementById('playerContributions');
        contributionsDiv.innerHTML = '';
        
        // Sort players by total contribution
        const sortedPlayers = Object.keys(playerContributions).sort((a, b) => {
            const totalA = Object.values(playerContributions[a].contributions).reduce((sum, val) => sum + val, 0);
            const totalB = Object.values(playerContributions[b].contributions).reduce((sum, val) => sum + val, 0);
            return totalB - totalA;
        });
        
        if (sortedPlayers.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-contributions';
            emptyMessage.textContent = 'No contributions yet. Be the first!';
            contributionsDiv.appendChild(emptyMessage);
            return;
        }
        
        // Create contribution elements for each player
        for (const playerId of sortedPlayers) {
            const playerData = playerContributions[playerId];
            const contributionDiv = document.createElement('div');
            contributionDiv.className = 'player-contribution';
            contributionDiv.id = `contribution-${playerId}`;
            
            // Player name with color indicator
            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-contribution-name';
            
            const colorIndicator = document.createElement('div');
            colorIndicator.className = 'player-contribution-color';
            colorIndicator.style.backgroundColor = getRocketColor(playerData.rocketType);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = playerData.name;
            
            nameDiv.appendChild(colorIndicator);
            nameDiv.appendChild(nameSpan);
            
            // Resources contributed
            const resourcesDiv = document.createElement('div');
            resourcesDiv.className = 'player-contribution-resources';
            
            for (const [resourceType, amount] of Object.entries(playerData.contributions)) {
                if (amount > 0) {
                    const resourceSpan = document.createElement('div');
                    resourceSpan.className = 'contribution-resource';
                    
                    const resourceIcon = document.createElement('div');
                    resourceIcon.className = 'contribution-resource-icon';
                    resourceIcon.style.backgroundColor = hubGoals[resourceType].color;
                    
                    const resourceAmount = document.createElement('span');
                    resourceAmount.textContent = amount;
                    
                    resourceSpan.appendChild(resourceIcon);
                    resourceSpan.appendChild(resourceAmount);
                    resourcesDiv.appendChild(resourceSpan);
                }
            }
            
            contributionDiv.appendChild(nameDiv);
            contributionDiv.appendChild(resourcesDiv);
            contributionsDiv.appendChild(contributionDiv);
        }
    }
    
    // Function to highlight a player's contribution
    function highlightPlayerContribution(playerId) {
        const contributionElement = document.getElementById(`contribution-${playerId}`);
        if (contributionElement) {
            contributionElement.classList.remove('contribution-highlight');
            void contributionElement.offsetWidth; // Trigger reflow
            contributionElement.classList.add('contribution-highlight');
        }
    }
    
    // Function to simulate other players contributing
    function simulateOtherPlayerContribution() {
        // Get a random player that isn't the current player
        const otherPlayers = players.filter(p => p.id !== player.id);
        if (otherPlayers.length === 0) return;
        
        const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
        const resourceTypes = Object.keys(hubGoals);
        const randomResource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
        const randomAmount = Math.floor(Math.random() * 50) + 10;
        
        // Add to player contributions
        if (!player.contributions) {
            player.contributions = { energy: 0, water: 0, organic: 0, mineral: 0 };
        }
        player.contributions[randomResource] += randomAmount;
        
        // Update hub goals
        hubGoals[randomResource].current += randomAmount;
        if (hubGoals[randomResource].current > hubGoals[randomResource].target) {
            hubGoals[randomResource].current = hubGoals[randomResource].target;
        }
            
            // Update displays
        updateHubProgress();
        updatePlayerContributionsDisplay();
        updateCollaborationPanel();
        
        // Highlight the contribution
        highlightPlayerContribution(randomPlayer.id);
            
            // Show system message
        showSystemMessage(`${randomPlayer.name} contributed ${randomAmount} ${randomResource} to the Galactic Hub!`);
        
        // Check hub completion
        checkHubCompletion();
    }
    
    // Helper function to get rocket color
    function getRocketColor(rocketType) {
        switch (rocketType) {
            case 'red': return '#FF5252';
            case 'blue': return '#4682B4';
            case 'green': return '#4CAF50';
            case 'yellow': return '#FFD700';
            default: return '#FFFFFF';
        }
    }
    
    // Update the Galactic Hub progress
    function updateHubProgress() {
        let totalProgress = 0;
        let totalTarget = 0;
        
        for (const [resourceType, goal] of Object.entries(hubGoals)) {
            // Update progress text and bar
            const progressSpan = document.getElementById(`${resourceType}-progress`);
            const progressBar = document.getElementById(`${resourceType}-bar`);
            
            if (progressSpan && progressBar) {
                progressSpan.textContent = `${goal.current}/${goal.target}`;
                const percentage = Math.min(100, (goal.current / goal.target) * 100);
                progressBar.style.width = `${percentage}%`;
            }
            
            // Update module fill
            updateModuleFill(resourceType, goal.current / goal.target);
            
            totalProgress += goal.current;
            totalTarget += goal.target;
        }
        
        // Update core module based on overall progress
        const corePercentage = totalTarget > 0 ? totalProgress / totalTarget : 0;
        updateModuleFill('core', corePercentage);
        
        // Check if all resources are complete
        checkHubCompletion();
    }
    
    // Function to update module fill based on resource progress
    function updateModuleFill(resourceType, percentage) {
        const module = document.querySelector(`.hub-module[data-module="${resourceType}"]`);
        if (!module) return;
        
        const fill = module.querySelector('.module-fill');
        if (!fill) return;
        
        // Set the fill height based on percentage
        fill.style.height = `${percentage * 100}%`;
        
        // Check if module is complete
        if (percentage >= 1.0 && !module.classList.contains('module-complete')) {
            module.classList.add('module-complete');
            showSystemMessage(`${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} module of the Galactic Hub is complete!`);
        }
        
        // Check thresholds for visual feedback
        if (hubGoals[resourceType]) {
            const thresholds = hubGoals[resourceType].moduleThresholds || [0.25, 0.5, 0.75, 1.0];
            for (const threshold of thresholds) {
                if (percentage >= threshold && !module.classList.contains(`threshold-${threshold * 100}`)) {
                    module.classList.add(`threshold-${threshold * 100}`);
                    
                    // Only show messages for resource modules, not the core
                    if (resourceType !== 'core') {
                        const thresholdPercent = threshold * 100;
                        showSystemMessage(`${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} module at ${thresholdPercent}% completion!`);
                    }
                }
            }
        }
    }
    
    // Update the checkHubCompletion function
    function checkHubCompletion() {
        let isComplete = true;
        
        for (const [resourceType, goal] of Object.entries(hubGoals)) {
            if (goal.current < goal.target) {
                isComplete = false;
                break;
            }
        }
        
        if (isComplete) {
            // All modules are complete
            const coreModule = document.querySelector('.hub-module[data-module="core"]');
            if (coreModule && !coreModule.classList.contains('hub-complete')) {
                coreModule.classList.add('hub-complete');
                coreModule.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
                
                // Celebration effect
                showSystemMessage('GALACTIC HUB CONSTRUCTION COMPLETE! Congratulations to all players!');
                
                // Add visual celebration effects
                const gameScreen = document.getElementById('gameScreen');
                const celebration = document.createElement('div');
                celebration.className = 'hub-completion-celebration';
                gameScreen.appendChild(celebration);
                
                // Remove celebration after animation
            setTimeout(() => {
                    if (celebration.parentNode) {
                        celebration.parentNode.removeChild(celebration);
                    }
                }, 10000);
            }
        }
    }
    
    // Show a system message (replaces chat messages with alerts or notifications)
    function showSystemMessage(message) {
        // Remove any existing notification
        const existingNotification = document.querySelector('.system-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create a new notification
        const notification = document.createElement('div');
        notification.className = 'system-notification';
        notification.textContent = message;
        
        // Add to the body
        document.body.appendChild(notification);
        
        // Remove after animation completes
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    // Toggle ping mode
    function togglePingMode() {
        isPingingActive = !isPingingActive;
        togglePingBtn.classList.toggle('active', isPingingActive);
        togglePingBtn.textContent = isPingingActive ? 'Cancel Marker' : 'Place Marker';
        
        // Change cursor
        canvas.style.cursor = isPingingActive ? 'crosshair' : 'grab';
    }
    
    // Add a ping to the map
    function addPing(x, y, message, sender) {
        const ping = {
            x: x,
            y: y,
            message: message || 'Look here!',
            sender: sender,
            timestamp: Date.now(),
            element: null
        };
        
        // Create ping element
        const pingElement = document.createElement('div');
        pingElement.className = 'map-ping';
        
        // Set color based on sender's rocket type
        let color = '#FFFFFF';
        for (const player of Object.values(players)) {
            if (player.name === sender) {
                switch(player.rocketType) {
                    case 'red':
                        color = '#FF5252';
                        break;
                    case 'blue':
                        color = '#4682B4';
                        break;
                    case 'green':
                        color = '#4CAF50';
                        break;
                    case 'yellow':
                        color = '#FFD700';
                        break;
                }
                break;
            }
        }
        
        pingElement.style.backgroundColor = color;
        pingElement.style.borderColor = color;
        
        // Create label
        const label = document.createElement('div');
        label.className = 'ping-label';
        label.textContent = `${sender}: ${ping.message}`;
        pingElement.appendChild(label);
        
        // Position ping
        updatePingPosition(ping, pingElement);
        
        // Add to document
        gameScreen.appendChild(pingElement);
        
        // Store element reference
        ping.element = pingElement;
        
        // Add to pings array
        pings.push(ping);
        
        // Remove ping after 10 seconds
        setTimeout(() => {
            removePing(ping);
        }, 10000);
    }
    
    // Update ping position based on camera and zoom
    function updatePingPosition(ping, element) {
        if (!element) return;
        
        // Convert world coordinates to screen coordinates
        const screenX = (ping.x - cameraX) * zoom + worldWidth / 2;
        const screenY = (ping.y - cameraY) * zoom + worldHeight / 2;
        
        // Update position
        element.style.left = `${screenX}px`;
        element.style.top = `${screenY}px`;
    }
    
    // Remove a ping
    function removePing(ping) {
        if (ping.element && ping.element.parentNode) {
            ping.element.parentNode.removeChild(ping.element);
        }
        
        // Remove from array
        const index = pings.indexOf(ping);
        if (index !== -1) {
            pings.splice(index, 1);
        }
    }
    
    // Update all ping positions when camera moves
    function updateAllPingPositions() {
        for (const ping of pings) {
            updatePingPosition(ping, ping.element);
        }
    }
    
    // Original game code starts here
    const canvas = document.getElementById('worldMap');
    const ctx = canvas.getContext('2d');
    
    // Make canvas fill the window
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 100; // Leave some space for UI
    
    // Configuration
    const hexSize = 20; // Size of hexagon (distance from center to corner)
    const worldWidth = canvas.width;
    const worldHeight = canvas.height;
    const starRadius = 150; // Radius of each star system
    
    // Camera/viewport variables
    let cameraX = 0;
    let cameraY = 0;
    let zoom = 1.0;
    const minZoom = 0.5;  // Zoom out limit
    const maxZoom = 2.0;  // Zoom in limit
    const panLimit = 6000; // Increased from 5000 to accommodate the wider spread
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    // Game state
    let selectedStar = null;
    let hoveredStar = null;
    let hoveredResourceIndicator = null; // Track hovered resource indicator
    let activeExploreButtonStar = null; // Track which star has an active explore button
    
    // Player rocket
    const player = {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        speed: 5,
        size: 30,
        rotation: 0,
        isMoving: false,
        fuel: 100,
        maxFuel: 100,
        rocketType: 'blue', // Default rocket type
        inventory: {}, // Add inventory to track resources
        chosenResource: null, // New property to track chosen resource per star
        currentStar: null     // New property to track which star the player is at
    };
    
    // Star systems (galaxy structure)
    const starSystems = [];
    const numStars = 60; // Increased from 30 to 60 to double the star population
    const galaxyRadius = 3000; // Keeping the galaxy radius the same
    const galaxyCenterX = 0; // Galaxy center X
    const galaxyCenterY = 0; // Galaxy center Y
    const spiralTightness = 0.2; // Loosened from 0.3 to stretch the spiral arms
    const numArms = 3; // Number of spiral arms
    
    // Colors for different star types
    const starColors = [
        // Blue stars (hot)
        ['#CAE1FF', '#A2C2FF', '#779ECB', '#5D8AAD', '#4682B4'],
        // Yellow stars (sun-like)
        ['#FFFACD', '#FFEC8B', '#FFD700', '#FFC125', '#FFA500'],
        // Red stars (cool)
        ['#FFB6C1', '#FF69B4', '#FF1493', '#C71585', '#DB7093'],
        // White stars
        ['#FFFFFF', '#F8F8FF', '#F5F5F5', '#F0F0F0', '#E6E6FA'],
        // Orange stars
        ['#FFDAB9', '#FFDEAD', '#FFA07A', '#FF8C00', '#FF7F50'],
        // Purple/blue stars
        ['#E6E6FA', '#D8BFD8', '#DDA0DD', '#DA70D6', '#BA55D3'],
        // Green stars (rare)
        ['#98FB98', '#90EE90', '#7CFC00', '#7FFF00', '#ADFF2F']
    ];
    
    // Star names
    const starNamePrefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
    const starNameSuffixes = ['Centauri', 'Cygni', 'Draconis', 'Eridani', 'Hydri', 'Leonis', 'Orionis', 'Persei', 'Tauri', 'Ursae', 'Velorum', 'Aquarii', 'Lyrae', 'Scorpii', 'Andromeda', 'Cassiopeia', 'Pegasi', 'Serpentis', 'Aurigae', 'Crateris'];
    
    // Constants for hexagon calculations
    const hexWidth = hexSize * 2;
    const hexHeight = Math.sqrt(3) * hexSize;
    
    // Initialize star systems in a galaxy pattern
    function initializeGalaxy() {
        starSystems.length = 0; // Clear existing stars
        
        // Create central star (galactic core)
        const coreSystem = {
            x: galaxyCenterX,
            y: galaxyCenterY,
            radius: starRadius * 1.5,
            colorIndex: 1, // Yellow star for the center
            name: 'Galactic Core',
            type: 'Supermassive',
            resources: Math.floor(Math.random() * 500) + 500,
            power: Math.floor(Math.random() * 20) + 10,
            hexagons: [], // Will store the hexagons for this star system
            harvestedResources: {}, // Track harvested resources
            resourcesByType: {}, // New property to store persistent resource amounts
            hasNexusShard: false
        };
        
        starSystems.push(coreSystem);
        
        // Create spiral arm stars
        for (let i = 1; i < numStars; i++) {
            // Choose which arm this star belongs to
            const arm = i % numArms;
            
            // Calculate distance from center (further stars are further out in the spiral)
            const distanceFromCenter = (i / numStars) * galaxyRadius * 1.2; // Slight stretch outward
            
            // Calculate angle based on distance (creates the spiral effect)
            const angle = (i / numStars) * 2 * Math.PI * spiralTightness * 10 + (2 * Math.PI * arm / numArms);
            
            // Add some randomness to the position
            const randomOffset = Math.random() * 800 - 400; // Widened from ±200 to ±400
            const randomAngleOffset = (Math.random() - 0.5) * 0.3; // Slightly increased randomness
            
            // Calculate position
            const x = galaxyCenterX + Math.cos(angle + randomAngleOffset) * (distanceFromCenter + randomOffset);
            const y = galaxyCenterY + Math.sin(angle + randomAngleOffset) * (distanceFromCenter + randomOffset);
            
            // Randomize star size
            const sizeMultiplier = Math.random() * 0.5 + 0.7;
            
            // Choose a random star type (color)
            const colorIndex = Math.floor(Math.random() * starColors.length);
            
            // Generate a name
            const namePrefix = starNamePrefixes[Math.floor(Math.random() * starNamePrefixes.length)];
            const nameSuffix = starNameSuffixes[Math.floor(Math.random() * starNameSuffixes.length)];
            const name = `${namePrefix} ${nameSuffix}`;
            
            // Determine star type based on color
            let type;
            switch(colorIndex) {
                case 0: type = 'Blue Giant'; break;
                case 1: type = 'Yellow Dwarf'; break;
                case 2: type = 'Red Dwarf'; break;
                case 3: type = 'White Dwarf'; break;
                case 4: type = 'Orange Giant'; break;
                case 5: type = 'Blue-Purple Variable'; break;
                case 6: type = 'Exotic Green'; break;
                default: type = 'Unknown';
            }
            
            // Add the star system
            starSystems.push({
                x: x,
                y: y,
                radius: starRadius * sizeMultiplier,
                colorIndex: colorIndex,
                name: name,
                type: type,
                resources: Math.floor(Math.random() * 200) + 50,
                power: Math.floor(Math.random() * 10) + 1,
                hexagons: [], // Will store the hexagons for this star system
                harvestedResources: {}, // Track harvested resources
                resourcesByType: {}, // Add to each star
                hasNexusShard: false
            });
        }
        
        // Generate hexagons for each star system
        generateAllStarSystemHexagons();
        
        // Add Nexus Shards to 3 random stars
        const shardCount = 3; // Fixed for simplicity
        const shuffledStars = [...starSystems].sort(() => Math.random() - 0.5);
        window.nexusShards = {};
        
        // Skip the Galactic Core (index 0)
        for (let i = 0; i < shardCount; i++) {
            const star = shuffledStars[i + 1]; // +1 to skip the core
            star.hasNexusShard = true;
            star.shardActivated = false;
            window.nexusShards[star.name] = {
                star: star,
                requiredResource: getShardResource(star.type),
                activated: false
            };
        }
        
        // Initialize resourcesByType for all stars after creation
        starSystems.forEach(star => {
            initializeStarResources(star);
        });
    }
    
    // New function to initialize star resources
    function initializeStarResources(star) {
        const resourceTypes = generateResourceTypes(star, true);
        star.resourcesByType = {};
        resourceTypes.forEach(resource => {
            star.resourcesByType[resource.type] = resource;
        });
    }
    
    // Function to determine which resource is required to activate a shard based on star type
    function getShardResource(starType) {
        // Use existing resources tied to rocket specializations
        const resourceMap = {
            'Blue Giant': 'water',      // Blue Rocket specialty
            'Yellow Dwarf': 'mineral',  // Yellow Rocket specialty
            'Red Dwarf': 'energy',      // Red Rocket specialty
            'White Dwarf': 'mineral',
            'Orange Giant': 'energy',
            'Blue-Purple Variable': 'water',
            'Exotic Green': 'organic',  // Green Rocket specialty
            'Supermassive': 'energy'
        };
        return resourceMap[starType] || 'mineral';
    }
    
    // Generate hexagons for all star systems
    function generateAllStarSystemHexagons() {
        for (const star of starSystems) {
            generateStarSystemHexagons(star);
        }
    }
    
    // Generate hexagons for a single star system
    function generateStarSystemHexagons(star) {
        star.hexagons = []; // Clear existing hexagons
        
        // Calculate the maximum radius in hexagon units
        const maxRadius = Math.ceil(star.radius / Math.min(hexWidth * 0.75, hexHeight * 0.5)) + 1;
        const colors = starColors[star.colorIndex];
        
        // Using axial coordinates (q, r) to generate hexagons
        for (let q = -maxRadius; q <= maxRadius; q++) {
            for (let r = -maxRadius; r <= maxRadius; r++) {
                // Convert axial to pixel coordinates relative to star center
                const x = q * hexSize * 1.5;
                const y = r * hexSize * Math.sqrt(3) + q * hexSize * Math.sqrt(3) / 2;
                
                // Check if the hex is inside the star system
                const distanceFromCenter = Math.sqrt(x * x + y * y);
                if (distanceFromCenter <= star.radius - hexSize) {
                    // Determine color based on distance from center
                    const normalizedDistance = distanceFromCenter / star.radius;
                    const colorIndex = Math.min(Math.floor(normalizedDistance * colors.length), colors.length - 1);
                    
                    // Add the hexagon to the star system
                    star.hexagons.push({
                        q: q,
                        r: r,
                        relativeX: x,
                        relativeY: y,
                        color: colors[colorIndex]
                    });
                }
            }
        }
    }
    
    // Noise function for terrain generation
    function noise(x, y) {
        // Simple pseudo-random noise function
        const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return value - Math.floor(value);
    }
    
    // Draw a single hexagon
    function drawHexagon(x, y, color, isDepleted = false, depletedResource = null) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * i;
            const xPos = x + hexSize * zoom * Math.cos(angle);
            const yPos = y + hexSize * zoom * Math.sin(angle);
            
            if (i === 0) {
                ctx.moveTo(xPos, yPos);
            } else {
                ctx.lineTo(xPos, yPos);
            }
        }
        ctx.closePath();
        
        ctx.fillStyle = color;
        ctx.fill();
        
        // Add special effect for depleted hexagons
        if (isDepleted) {
            // Add a pattern or texture to indicate depletion
            ctx.save();
            
            // Create a pattern of diagonal lines
            const patternSize = 4 * zoom;
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = patternSize;
            patternCanvas.height = patternSize;
            const patternCtx = patternCanvas.getContext('2d');
            
            // Draw diagonal lines
            patternCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            patternCtx.lineWidth = 1;
            patternCtx.beginPath();
            patternCtx.moveTo(0, patternSize);
            patternCtx.lineTo(patternSize, 0);
            patternCtx.stroke();
            
            // Create and apply the pattern
            const pattern = ctx.createPattern(patternCanvas, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fill();
            
            ctx.restore();
        }
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    
    // Draw the background
    function drawBackground() {
        // Space background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, worldWidth, worldHeight);
        
        // Add some distant stars
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * worldWidth;
            const y = Math.random() * worldHeight;
            const size = Math.random() * 1.5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Draw star systems with their hexagons
    function drawStarSystems() {
        for (const star of starSystems) {
            // Calculate screen position of the star
            const screenX = (star.x - cameraX) * zoom + worldWidth / 2;
            const screenY = (star.y - cameraY) * zoom + worldHeight / 2;
            const scaledRadius = star.radius * zoom;
            
            // Skip if the star is completely off screen
            if (screenX + scaledRadius < 0 || screenX - scaledRadius > worldWidth ||
                screenY + scaledRadius < 0 || screenY - scaledRadius > worldHeight) {
                continue;
            }
            
            // Draw all hexagons for this star system
            for (const hex of star.hexagons) {
                // Calculate screen position of the hexagon
                const hexScreenX = screenX + hex.relativeX * zoom;
                const hexScreenY = screenY + hex.relativeY * zoom;
                
                // Skip if the hexagon is off screen (with some margin)
                if (hexScreenX < -hexSize * 2 * zoom || hexScreenX > worldWidth + hexSize * 2 * zoom ||
                    hexScreenY < -hexSize * 2 * zoom || hexScreenY > worldHeight + hexSize * 2 * zoom) {
                    continue;
                }
                
                // Draw the hexagon with depleted status if applicable
                drawHexagon(hexScreenX, hexScreenY, hex.color, hex.depleted, hex.depletedResource);
            }
        }
    }
    
    // Draw star system boundaries
    function drawStarBoundaries() {
        for (const star of starSystems) {
            // Calculate screen position
            const screenX = (star.x - cameraX) * zoom + worldWidth / 2;
            const screenY = (star.y - cameraY) * zoom + worldHeight / 2;
            const scaledRadius = star.radius * zoom;
            
            // Skip if off screen
            if (screenX + scaledRadius < 0 || screenX - scaledRadius > worldWidth ||
                screenY + scaledRadius < 0 || screenY - scaledRadius > worldHeight) {
                continue;
            }
            
            // Draw star boundary
            ctx.beginPath();
            ctx.arc(screenX, screenY, scaledRadius, 0, Math.PI * 2);
            
            // Highlight selected or hovered star
            if (star === selectedStar) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 3;
            } else if (star === hoveredStar) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
            }
            
            ctx.stroke();
            
            // Draw Nexus Shard indicator if the star has one
            if (star.hasNexusShard) {
                // Draw a glowing aura around the star
                const gradient = ctx.createRadialGradient(
                    screenX, screenY, scaledRadius * 0.8,
                    screenX, screenY, scaledRadius * 1.5
                );
                
                if (star.shardActivated) {
                    // Activated shard has a bright golden glow
                    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
                    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
                } else {
                    // Inactive shard has a subtle purple glow
                    gradient.addColorStop(0, 'rgba(138, 43, 226, 0.4)');
                    gradient.addColorStop(1, 'rgba(138, 43, 226, 0)');
                }
                
                ctx.beginPath();
                ctx.arc(screenX, screenY, scaledRadius * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Draw shard symbol
                ctx.save();
                ctx.translate(screenX, screenY);
                
                // Draw a diamond/crystal shape
                const shardSize = scaledRadius * 0.5;
                ctx.beginPath();
                ctx.moveTo(0, -shardSize);
                ctx.lineTo(shardSize * 0.7, 0);
                ctx.lineTo(0, shardSize);
                ctx.lineTo(-shardSize * 0.7, 0);
                ctx.closePath();
                
                // Fill with gradient
                const shardGradient = ctx.createLinearGradient(
                    -shardSize * 0.7, 0,
                    shardSize * 0.7, 0
                );
                
                if (star.shardActivated) {
                    // Activated shard is golden
                    shardGradient.addColorStop(0, '#FFD700');
                    shardGradient.addColorStop(0.5, '#FFF8DC');
                    shardGradient.addColorStop(1, '#FFD700');
                } else {
                    // Inactive shard is purple
                    shardGradient.addColorStop(0, '#8A2BE2');
                    shardGradient.addColorStop(0.5, '#E6E6FA');
                    shardGradient.addColorStop(1, '#8A2BE2');
                }
                
                ctx.fillStyle = shardGradient;
                ctx.fill();
                
                // Add a stroke
                ctx.strokeStyle = star.shardActivated ? '#FFFFFF' : '#C0C0C0';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                ctx.restore();
                
                // Add "Nexus Shard" text if zoomed in enough or if selected/hovered
                if (star === selectedStar || star === hoveredStar || zoom > 0.8) {
                    ctx.font = `bold ${12 * zoom}px Arial`;
                    ctx.fillStyle = star.shardActivated ? '#FFD700' : '#9370DB';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Nexus Shard', screenX, screenY + scaledRadius + 15 * zoom);
                    
                    // Add activation status if zoomed in further
                    if (zoom > 1.2) {
                        ctx.font = `${10 * zoom}px Arial`;
                        ctx.fillStyle = star.shardActivated ? '#98FB98' : '#FFC0CB';
                        const statusText = star.shardActivated ? 'Activated' : 'Inactive';
                        ctx.fillText(statusText, screenX, screenY + scaledRadius + 30 * zoom);
                    }
                }
            }
            
            // Draw star name if zoomed in enough or if selected/hovered
            if (star === selectedStar || star === hoveredStar || zoom > 0.8) {
                ctx.font = `bold ${14 * zoom}px Arial`;
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(star.name, screenX, screenY - scaledRadius - 15 * zoom);
            }
            
            // Draw harvested resources indicators if any resources have been harvested
            const harvestedResourceTypes = Object.keys(star.harvestedResources);
            if (harvestedResourceTypes.length > 0) {
                // Draw resource indicators around the star
                const indicatorRadius = scaledRadius * 0.2;
                const indicatorDistance = scaledRadius * 1.2;
                
                // Calculate positions for resource indicators in a circle around the star
                for (let i = 0; i < harvestedResourceTypes.length; i++) {
                    const resourceType = harvestedResourceTypes[i];
                    const resource = star.harvestedResources[resourceType];
                    
                    // Calculate position around the star
                    const angle = (i / harvestedResourceTypes.length) * Math.PI * 2;
                    const indicatorX = screenX + Math.cos(angle) * indicatorDistance;
                    const indicatorY = screenY + Math.sin(angle) * indicatorDistance;
                    
                    // Draw resource indicator
                    ctx.beginPath();
                    ctx.arc(indicatorX, indicatorY, indicatorRadius, 0, Math.PI * 2);
                    ctx.fillStyle = resource.color;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    // Draw resource amount if zoomed in enough
                    if (zoom > 0.8) {
                        ctx.font = `bold ${10 * zoom}px Arial`;
                        ctx.fillStyle = '#FFFFFF';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(resource.amount, indicatorX, indicatorY);
                    }
                }
            }
        }
    }
    
    // Draw mini-map in the corner
    function drawMiniMap() {
        const mapSize = 150;
        const mapX = worldWidth - mapSize - 20;
        const mapY = worldHeight - mapSize - 20;
        const mapScale = mapSize / (galaxyRadius * 2.5);
    
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);
    
        // Draw star systems on mini-map
        for (const star of starSystems) {
            const miniX = mapX + (mapSize / 2) + star.x * mapScale;
            const miniY = mapY + (mapSize / 2) + star.y * mapScale;
    
            // Skip if off mini-map
            if (miniX < mapX || miniX > mapX + mapSize || miniY < mapY || miniY > mapY + mapSize) {
                continue;
            }
    
            // Draw star on mini-map
            const miniRadius = Math.max(2, star.radius * mapScale);
            ctx.beginPath();
            ctx.arc(miniX, miniY, miniRadius, 0, Math.PI * 2);
            ctx.fillStyle = starColors[star.colorIndex][2];
            ctx.fill();
    
            // Highlight selected star
            if (star === selectedStar) {
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
    
            // Draw ring for Nexus Shard stars
            if (star.hasNexusShard) {
                ctx.save();
                const ringRadius = miniRadius + 3; // Increased for visibility
                ctx.beginPath();
                ctx.arc(miniX, miniY, ringRadius, 0, Math.PI * 2);
                ctx.strokeStyle = star.shardActivated ? '#00FF00' : '#FFD700';
                ctx.lineWidth = 2; // Thicker for clarity
                ctx.setLineDash([2, 2]);
                ctx.stroke();
    
                // Debug: Add a small red dot to confirm rendering
                ctx.beginPath();
                ctx.arc(miniX, miniY, 1, 0, Math.PI * 2);
                ctx.fillStyle = '#FF0000';
                ctx.fill();
    
                ctx.restore();
            }
        }
    
        // Draw viewport indicator (moved to end to ensure it's on top)
        const viewportWidth = (worldWidth / zoom) * mapScale;
        const viewportHeight = (worldHeight / zoom) * mapScale;
        const viewportX = mapX + (mapSize / 2) + (cameraX * mapScale) - (viewportWidth / 2);
        const viewportY = mapY + (mapSize / 2) + (cameraY * mapScale) - (viewportHeight / 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    }
    
    
    // Enforce camera limits
    function enforceCameraLimits() {
        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(cameraX * cameraX + cameraY * cameraY);
        
        // If beyond the limit, scale back
        if (distanceFromCenter > panLimit) {
            const angle = Math.atan2(cameraY, cameraX);
            cameraX = Math.cos(angle) * panLimit;
            cameraY = Math.sin(angle) * panLimit;
        }
    }
    
    // Update star system info in the UI
    function updateStarInfo() {
        // This function previously updated the top panel info
        // Since we've removed the panel, this function is now empty
        // We're keeping it in case other code calls it
    }
    
    // Update pan limit indicator
    function updatePanLimitIndicator() {
        const distanceFromCenter = Math.sqrt(cameraX * cameraX + cameraY * cameraY);
        const distancePercent = Math.round((distanceFromCenter / panLimit) * 100);
        
        // Update text
        document.getElementById('distancePercent').textContent = `${distancePercent}%`;
        
        // Update progress bar
        document.getElementById('distanceBar').style.width = `${distancePercent}%`;
    }
    
    // Draw player rocket
    function drawPlayer() {
        // Calculate screen position
        const screenX = (player.x - cameraX) * zoom + worldWidth / 2;
        const screenY = (player.y - cameraY) * zoom + worldHeight / 2;
        const scaledSize = player.size * zoom;
        
        // Skip if off screen
        if (screenX + scaledSize < 0 || screenX - scaledSize > worldWidth ||
            screenY + scaledSize < 0 || screenY - scaledSize > worldHeight) {
            return;
        }
        
        // Save context state
        ctx.save();
        
        // Draw player name tag (before rotation so it stays upright)
        drawPlayerNameTag(screenX, screenY, scaledSize);
        
        // Translate to rocket position and rotate
        ctx.translate(screenX, screenY);
        ctx.rotate(player.rotation);
        
        // Get rocket color based on type
        let rocketColor;
        switch(player.rocketType) {
            case 'red':
                rocketColor = '#FF5252';
                break;
            case 'green':
                rocketColor = '#4CAF50';
                break;
            case 'yellow':
                rocketColor = '#FFD700';
                break;
            case 'blue':
            default:
                rocketColor = '#4682B4';
                break;
        }
        
        // Draw rocket with more realistic details
        
        // Engine flames if moving
        if (player.isMoving) {
            // Main engine flame
            const flameLength = scaledSize * (0.7 + Math.random() * 0.3); // Randomize flame length for effect
            
            // Gradient for flame
            const flameGradient = ctx.createLinearGradient(0, scaledSize * 0.6, 0, scaledSize * 0.6 + flameLength);
            flameGradient.addColorStop(0, '#FFFFFF');
            flameGradient.addColorStop(0.3, '#FFA500');
            flameGradient.addColorStop(0.6, '#FF4500');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.moveTo(-scaledSize * 0.2, scaledSize * 0.6);
            ctx.quadraticCurveTo(0, scaledSize * 0.6 + flameLength * 1.5, scaledSize * 0.2, scaledSize * 0.6);
            ctx.closePath();
            ctx.fill();
            
            // Side thruster flames (smaller)
            const sideFlameLength = scaledSize * 0.3 * (0.7 + Math.random() * 0.3);
            
            // Left thruster
            ctx.fillStyle = '#FFA500';
            ctx.beginPath();
            ctx.moveTo(-scaledSize * 0.35, scaledSize * 0.4);
            ctx.lineTo(-scaledSize * 0.5, scaledSize * 0.4 + sideFlameLength);
            ctx.lineTo(-scaledSize * 0.3, scaledSize * 0.4);
            ctx.closePath();
            ctx.fill();
            
            // Right thruster
            ctx.beginPath();
            ctx.moveTo(scaledSize * 0.35, scaledSize * 0.4);
            ctx.lineTo(scaledSize * 0.5, scaledSize * 0.4 + sideFlameLength);
            ctx.lineTo(scaledSize * 0.3, scaledSize * 0.4);
            ctx.closePath();
            ctx.fill();
        }
        
        // Main rocket body - using selected rocket color
        ctx.fillStyle = rocketColor;
        ctx.beginPath();
        ctx.moveTo(0, -scaledSize * 0.7); // Nose
        ctx.bezierCurveTo(
            scaledSize * 0.3, -scaledSize * 0.5, // Control point 1
            scaledSize * 0.3, scaledSize * 0.3,  // Control point 2
            scaledSize * 0.25, scaledSize * 0.6   // End point (bottom right)
        );
        ctx.lineTo(-scaledSize * 0.25, scaledSize * 0.6); // Bottom left
        ctx.bezierCurveTo(
            -scaledSize * 0.3, scaledSize * 0.3,  // Control point 1
            -scaledSize * 0.3, -scaledSize * 0.5, // Control point 2
            0, -scaledSize * 0.7                 // Back to nose
        );
        ctx.closePath();
        ctx.fill();
        
        // Add shading to give 3D effect
        const bodyGradient = ctx.createLinearGradient(-scaledSize * 0.25, 0, scaledSize * 0.25, 0);
        // Create a lighter and darker version of the rocket color for the gradient
        const lighterColor = lightenColor(rocketColor, 30);
        const darkerColor = darkenColor(rocketColor, 30);
        
        bodyGradient.addColorStop(0, darkerColor);
        bodyGradient.addColorStop(0.5, lighterColor);
        bodyGradient.addColorStop(1, darkerColor);
        
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.moveTo(0, -scaledSize * 0.65); // Slightly below nose
        ctx.bezierCurveTo(
            scaledSize * 0.25, -scaledSize * 0.5,
            scaledSize * 0.25, scaledSize * 0.3,
            scaledSize * 0.2, scaledSize * 0.55
        );
        ctx.lineTo(-scaledSize * 0.2, scaledSize * 0.55);
        ctx.bezierCurveTo(
            -scaledSize * 0.25, scaledSize * 0.3,
            -scaledSize * 0.25, -scaledSize * 0.5,
            0, -scaledSize * 0.65
        );
        ctx.closePath();
        ctx.fill();
        
        // Cockpit window - blue with reflection
        const windowGradient = ctx.createRadialGradient(
            scaledSize * 0.05, -scaledSize * 0.3, 0,
            scaledSize * 0.05, -scaledSize * 0.3, scaledSize * 0.2
        );
        windowGradient.addColorStop(0, '#FFFFFF');
        windowGradient.addColorStop(0.2, '#87CEEB');
        windowGradient.addColorStop(1, '#4682B4');
        
        ctx.fillStyle = windowGradient;
        ctx.beginPath();
        ctx.ellipse(0, -scaledSize * 0.3, scaledSize * 0.15, scaledSize * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wing details
        ctx.fillStyle = '#B0B0B0';
        
        // Left wing
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.25, scaledSize * 0.2);
        ctx.lineTo(-scaledSize * 0.5, scaledSize * 0.4);
        ctx.lineTo(-scaledSize * 0.25, scaledSize * 0.5);
        ctx.closePath();
        ctx.fill();
        
        // Right wing
        ctx.beginPath();
        ctx.moveTo(scaledSize * 0.25, scaledSize * 0.2);
        ctx.lineTo(scaledSize * 0.5, scaledSize * 0.4);
        ctx.lineTo(scaledSize * 0.25, scaledSize * 0.5);
        ctx.closePath();
        ctx.fill();
        
        // Engine section
        ctx.fillStyle = '#707070';
        ctx.beginPath();
        ctx.rect(-scaledSize * 0.25, scaledSize * 0.5, scaledSize * 0.5, scaledSize * 0.1);
        ctx.fill();
        
        // Engine nozzle
        ctx.fillStyle = '#505050';
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.2, scaledSize * 0.6);
        ctx.lineTo(scaledSize * 0.2, scaledSize * 0.6);
        ctx.lineTo(scaledSize * 0.15, scaledSize * 0.7);
        ctx.lineTo(-scaledSize * 0.15, scaledSize * 0.7);
        ctx.closePath();
        ctx.fill();
        
        // Detail lines for panels and structure
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = Math.max(1, scaledSize * 0.02);
        
        // Body panel lines
        ctx.beginPath();
        ctx.moveTo(0, -scaledSize * 0.7);
        ctx.lineTo(0, scaledSize * 0.5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.15, -scaledSize * 0.5);
        ctx.lineTo(-scaledSize * 0.15, scaledSize * 0.3);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(scaledSize * 0.15, -scaledSize * 0.5);
        ctx.lineTo(scaledSize * 0.15, scaledSize * 0.3);
        ctx.stroke();
        
        // Wing detail lines
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.25, scaledSize * 0.3);
        ctx.lineTo(-scaledSize * 0.4, scaledSize * 0.4);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(scaledSize * 0.25, scaledSize * 0.3);
        ctx.lineTo(scaledSize * 0.4, scaledSize * 0.4);
        ctx.stroke();
        
        // Restore context state
        ctx.restore();
        
        // Draw fuel gauge above the rocket
        const fuelWidth = scaledSize * 1.5;
        const fuelHeight = scaledSize / 6;
        const fuelX = screenX - fuelWidth / 2;
        const fuelY = screenY - scaledSize * 1.5;
        
        // Fuel background with border
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(fuelX, fuelY, fuelWidth, fuelHeight);
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1;
        ctx.strokeRect(fuelX, fuelY, fuelWidth, fuelHeight);
        
        // Fuel level with gradient
        const fuelLevel = (player.fuel / player.maxFuel) * fuelWidth;
        let fuelGradient;
        
        if (player.fuel > 70) {
            // Green gradient for high fuel
            fuelGradient = ctx.createLinearGradient(fuelX, fuelY, fuelX + fuelLevel, fuelY);
            fuelGradient.addColorStop(0, '#00FF00');
            fuelGradient.addColorStop(1, '#00AA00');
        } else if (player.fuel > 30) {
            // Yellow gradient for medium fuel
            fuelGradient = ctx.createLinearGradient(fuelX, fuelY, fuelX + fuelLevel, fuelY);
            fuelGradient.addColorStop(0, '#FFFF00');
            fuelGradient.addColorStop(1, '#FFA500');
        } else {
            // Red gradient for low fuel
            fuelGradient = ctx.createLinearGradient(fuelX, fuelY, fuelX + fuelLevel, fuelY);
            fuelGradient.addColorStop(0, '#FF0000');
            fuelGradient.addColorStop(1, '#AA0000');
        }
        
        ctx.fillStyle = fuelGradient;
        ctx.fillRect(fuelX, fuelY, fuelLevel, fuelHeight);
        
        // Add fuel text with improved readability
        // First draw a dark outline/shadow for the text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.font = `bold ${Math.max(10, Math.floor(fuelHeight * 0.8))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw text outline by offsetting in multiple directions
        const fuelText = `FUEL: ${Math.floor(player.fuel)}%`;
        const textX = fuelX + fuelWidth / 2;
        const textY = fuelY + fuelHeight / 2;
        const outlineWidth = 2;
        
        // Draw the text outline
        ctx.fillText(fuelText, textX - outlineWidth, textY - outlineWidth);
        ctx.fillText(fuelText, textX + outlineWidth, textY - outlineWidth);
        ctx.fillText(fuelText, textX - outlineWidth, textY + outlineWidth);
        ctx.fillText(fuelText, textX + outlineWidth, textY + outlineWidth);
        
        // Draw the main text in white
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(fuelText, textX, textY);
    }
    
    // Update player position (move towards target)
    function updatePlayerPosition() {
        if (player.isMoving) {
            // Calculate direction to target
            const dx = player.targetX - player.x;
            const dy = player.targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Update rotation to face target
            player.rotation = Math.atan2(dy, dx) + Math.PI / 2;
            
            // If close to target, stop moving
            if (distance < player.speed) {
                player.x = player.targetX;
                player.y = player.targetY;
                player.isMoving = false;
                return;
            }
            
            // Calculate next position
            const moveX = (dx / distance) * player.speed;
            const moveY = (dy / distance) * player.speed;
            const nextX = player.x + moveX;
            const nextY = player.y + moveY;
            
            // Check if next position would collide with any star
            let collision = false;
            let collidedStar = null;
            
            for (const star of starSystems) {
                const starDx = nextX - star.x;
                const starDy = nextY - star.y;
                const starDistance = Math.sqrt(starDx * starDx + starDy * starDy);
                
                // If the next position would be inside a star, stop movement
                if (starDistance <= star.radius) {
                    collision = true;
                    collidedStar = star;
                    break;
                }
            }
            
            if (collision) {
                player.isMoving = false;
                showExploreButton(collidedStar);
            } else {
                // Move towards target if no collision
                player.x = nextX;
                player.y = nextY;
                
                // Consume fuel
                player.fuel = Math.max(0, player.fuel - 0.1);
                
                // If out of fuel, stop moving
                if (player.fuel <= 0) {
                    player.isMoving = false;
                }
                
                // Center camera on player
                cameraX = player.x;
                cameraY = player.y;
                
                // Enforce camera limits
                enforceCameraLimits();
                
                // Hide explore button when moving
                hideExploreButton();
            }
        }
        
        // If position changed and we're connected to a server, emit update
        if (player.isMoving && socket && socket.connected) {
            socket.emit('updatePosition', {
                x: player.x,
                y: player.y
            });
        }
        
        // Sync with players object
        if (currentPlayerId && players[currentPlayerId]) {
            players[currentPlayerId].x = player.x;
            players[currentPlayerId].y = player.y;
            players[currentPlayerId].isMoving = false;
            players[currentPlayerId].rotation = player.rotation;
            players[currentPlayerId].visible = true; // Ensure visibility
            
            // Keep currentPlayer in sync
            currentPlayer = players[currentPlayerId];
        }
    }
    
    // Create and show explore button when colliding with a star
    function showExploreButton(star) {
        // Remove any existing explore button
        hideExploreButton();
        
        // Store reference to the star with active explore button
        activeExploreButtonStar = star;
        
        // Create explore button
        const exploreBtn = document.createElement('button');
        exploreBtn.id = 'exploreBtn';
        exploreBtn.textContent = 'Explore ' + star.name;
        exploreBtn.className = 'explore-btn';
        exploreBtn.style.position = 'absolute';
        
        // Check for Nexus Shard activation when two players are present
        if (star.hasNexusShard && !star.shardActivated) {
            const playersAtStar = Object.values(players).filter(p => 
                Math.sqrt((p.x - star.x) ** 2 + (p.y - star.y) ** 2) <= star.radius
            );
            
            if (playersAtStar.length >= 2) {
                // Automatically activate the shard when two or more players are present
                activateNexusShardWithPlayers(star, playersAtStar);
                exploreBtn.textContent = 'Explore ' + star.name + ' (Shard Activated)';
            } else {
                exploreBtn.textContent = 'Await Ally at ' + star.name;
            }
        }
        
        // Calculate button position (centered below the star on screen)
        updateExploreButtonPosition();
        
        // Add click event to explore the star
        exploreBtn.addEventListener('click', () => {
            // Open the exploration interface
            openExplorationInterface(star);
            
            // Select the star
            selectedStar = star;
            updateStarInfo();
            render();
        });
        
        // Add button to the document
        document.body.appendChild(exploreBtn);
    }
    
    // Update the position of the explore button based on star position
    function updateExploreButtonPosition() {
        if (!activeExploreButtonStar) return;
        
        const exploreBtn = document.getElementById('exploreBtn');
        if (!exploreBtn) return;
        
        // Calculate button position (centered below the star on screen)
        const screenX = (activeExploreButtonStar.x - cameraX) * zoom + worldWidth / 2;
        const screenY = (activeExploreButtonStar.y - cameraY) * zoom + worldHeight / 2;
        const scaledRadius = activeExploreButtonStar.radius * zoom;
        
        exploreBtn.style.left = `${screenX - 75}px`;
        exploreBtn.style.top = `${screenY + scaledRadius + 10}px`;
        exploreBtn.style.width = '150px';
    }
    
    // Hide explore button
    function hideExploreButton() {
        const existingBtn = document.getElementById('exploreBtn');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Clear the reference to the star
        activeExploreButtonStar = null;
    }
    
    // Open detailed exploration interface
    function openExplorationInterface(star) {
        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'explorationModal';
        modal.className = 'exploration-modal';
        
        // Generate star color for the header
        const starColorIndex = star.colorIndex;
        const headerColor = starColors[starColorIndex][2]; // Middle color from the palette
        
        // Check if this star has a Nexus Shard
        const hasNexusShard = star.hasNexusShard;
        const shardActivated = star.shardActivated;
        const nexusShard = window.nexusShards[star.name];
        const requiredResource = nexusShard ? nexusShard.requiredResource : null;
        
        // Create modal content
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(to right, #000000, ${headerColor}, #000000);">
                    <h2>${star.name}</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="star-info">
                        <div class="star-image" style="background-color: ${headerColor};">
                            <div class="star-glow" style="box-shadow: 0 0 30px 10px ${headerColor};"></div>
                            ${hasNexusShard ? `<div class="nexus-shard-icon ${shardActivated ? 'activated' : ''}"></div>` : ''}
                            ${star.hasNexusCore ? `<div class="nexus-core-icon ${window.cosmicNexusActive ? 'activated' : ''}"></div>` : ''}
                        </div>
                        <div class="star-details">
                            <p><strong>Type:</strong> ${star.type}</p>
                            <p><strong>Resources:</strong> <span class="resource-value">${star.resources}</span></p>
                            <p><strong>Power:</strong> <span class="power-value">${star.power}</span></p>
                            ${hasNexusShard ? `<p class="nexus-shard-info"><strong>Nexus Shard:</strong> <span class="${shardActivated ? 'activated' : 'inactive'}">${shardActivated ? 'Activated' : 'Inactive'}</span></p>` : ''}
                            ${star.hasNexusCore ? `<p class="nexus-core-info"><strong>Nexus Core:</strong> <span class="${window.cosmicNexusActive ? 'activated' : 'inactive'}">${window.cosmicNexusActive ? 'Activated' : 'Inactive'}</span></p>` : ''}
                            <div class="resource-bar-container">
                                <div class="resource-label">Resources</div>
                                <div class="resource-bar-bg">
                                    <div class="resource-bar" style="width: ${Math.min(100, star.resources / 10)}%;"></div>
                                </div>
                            </div>
                            <div class="resource-bar-container">
                                <div class="resource-label">Power</div>
                                <div class="resource-bar-bg">
                                    <div class="power-bar" style="width: ${Math.min(100, star.power * 5)}%;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="exploration-actions">
                        <h3>Actions</h3>
                        <div class="action-buttons">
                            <button id="harvestBtn" class="action-btn harvest-btn">Harvest Resources</button>
                            <button id="refuelBtn" class="action-btn refuel-btn">Refuel Ship</button>
                            <button id="scanBtn" class="action-btn scan-btn">Scan System</button>
                            ${hasNexusShard && !shardActivated ? `<button id="activateShardBtn" class="action-btn activate-shard-btn">Activate Nexus Shard</button>` : ''}
                        </div>
                    </div>
                    
                    ${hasNexusShard && !shardActivated ? `
                    <div class="nexus-shard-section">
                        <h3>Nexus Shard</h3>
                        <p>This star contains an inactive Nexus Shard. Activate it by contributing resources.</p>
                        <p>Required Resource: <strong>${requiredResource.charAt(0).toUpperCase() + requiredResource.slice(1)}</strong></p>
                        <p>Amount Needed: <strong>50 units</strong></p>
                    </div>
                    ` : ''}
                    
                    ${star.hasNexusCore && !window.cosmicNexusActive ? `
                    <div class="nexus-core-section">
                        <h3>Cosmic Nexus Core</h3>
                        <div id="nexusCoreResources"></div>
                        <button id="activateNexusBtn" disabled>Activate Nexus (All Players Required)</button>
                    </div>
                    ` : ''}
                    
                    <div class="exploration-log-container">
                        <h3>Exploration Log</h3>
                        <div id="explorationLog" class="exploration-log"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="leaveSystemBtn" class="leave-btn">Leave System</button>
                </div>
            </div>
        `;
        
        // Add modal to the document
        document.body.appendChild(modal);
        
        // Update the Nexus Core display if this star has the Nexus Core
        if (star.hasNexusCore && !window.cosmicNexusActive) {
            updateNexusCoreDisplay();
        }
        
        // Add event listeners for modal interactions with null checks
        
        // Close button
        const closeButton = modal.querySelector('.close-modal');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                closeExplorationInterface();
            });
        }
        
        // Leave system button
        const leaveButton = modal.querySelector('#leaveSystemBtn');
        if (leaveButton) {
            leaveButton.addEventListener('click', () => {
                closeExplorationInterface();
            });
        }
        
        // Harvest resources button
        const harvestButton = modal.querySelector('#harvestBtn');
        if (harvestButton) {
            harvestButton.addEventListener('click', () => {
                if (star.resources > 0) {
                    // Open resource harvesting map instead of directly harvesting
                    openResourceHarvestingMap(star, modal);
                } else {
                    // Add log entry for no resources
                    const logEntry = document.createElement('p');
                    logEntry.textContent = `No resources left to harvest.`;
                    const explorationLog = modal.querySelector('#explorationLog');
                    if (explorationLog) {
                        explorationLog.appendChild(logEntry);
                        explorationLog.scrollTop = explorationLog.scrollHeight;
                    }
                }
            });
        }
        
        // Refuel button
        const refuelButton = modal.querySelector('#refuelBtn');
        if (refuelButton) {
            refuelButton.addEventListener('click', () => {
                if (player.fuel < player.maxFuel) {
                    const previousFuel = player.fuel;
                    player.fuel = player.maxFuel;
                    
                    // Add log entry
                    const logEntry = document.createElement('p');
                    logEntry.textContent = `Ship refueled from ${Math.floor(previousFuel)}% to 100%.`;
                    const explorationLog = modal.querySelector('#explorationLog');
                    if (explorationLog) {
                        explorationLog.appendChild(logEntry);
                        explorationLog.scrollTop = explorationLog.scrollHeight;
                    }
                } else {
                    // Add log entry for full fuel
                    const logEntry = document.createElement('p');
                    logEntry.textContent = `Ship's fuel tanks are already full.`;
                    const explorationLog = modal.querySelector('#explorationLog');
                    if (explorationLog) {
                        explorationLog.appendChild(logEntry);
                        explorationLog.scrollTop = explorationLog.scrollHeight;
                    }
                }
            });
        }
        
        // Activate Nexus Shard button
        if (hasNexusShard && !shardActivated) {
            const activateShardButton = modal.querySelector('#activateShardBtn');
            if (activateShardButton) {
                activateShardButton.addEventListener('click', () => {
                    activateNexusShard(star, requiredResource, modal);
                });
            }
        }
        
        // Scan system button
        const scanButton = modal.querySelector('#scanBtn');
        if (scanButton) {
            scanButton.addEventListener('click', () => {
                // Generate random discovery
                const discoveries = [
                    `Detected unusual radiation patterns in the star's corona.`,
                    `Found traces of rare minerals in the system's asteroid belt.`,
                    `Observed interesting planetary formations in the outer system.`,
                    `Discovered ancient technological remnants in orbit.`,
                    `Measured unusual gravitational fluctuations in the system.`,
                    `Detected faint signals of unknown origin.`
                ];
                
                const discovery = discoveries[Math.floor(Math.random() * discoveries.length)];
                
                // Add log entry
                const logEntry = document.createElement('p');
                logEntry.textContent = `Scan complete: ${discovery}`;
                const explorationLog = modal.querySelector('#explorationLog');
                if (explorationLog) {
                    explorationLog.appendChild(logEntry);
                    explorationLog.scrollTop = explorationLog.scrollHeight;
                }
            });
        }
        
        // Handle ESC key to close modal
        const escapeHandler = (event) => {
            if (event.key === 'Escape') {
                closeExplorationInterface();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        
        document.addEventListener('keydown', escapeHandler);
        
        const resourceTypes = Object.values(star.resourcesByType || {}); // Use persistent state
        
            drawResourceMap(star, resourceTypes);
    }
    
    // Function to activate a Nexus Shard
    function activateNexusShard(star, requiredResource, modal) {
        const currentPlayer = players[currentPlayerId];
        const explorationLog = modal.querySelector('#explorationLog');
        
        // If explorationLog is null, we can't proceed properly
        if (!explorationLog) {
            console.error("Could not find exploration log element");
            return;
        }
        
        // Check if player has the required resource
        if (!currentPlayer.inventory[requiredResource] || 
            currentPlayer.inventory[requiredResource].amount < 50) {
            
            // Add log entry for insufficient resources
            const logEntry = document.createElement('p');
            logEntry.textContent = `Cannot activate Nexus Shard: You need at least 50 units of ${requiredResource.charAt(0).toUpperCase() + requiredResource.slice(1)}.`;
            explorationLog.appendChild(logEntry);
            explorationLog.scrollTop = explorationLog.scrollHeight;
            return;
        }
        
        // Consume the resource
        currentPlayer.inventory[requiredResource].amount -= 50;
        
        // Activate the shard
        star.shardActivated = true;
        window.nexusShards[star.name].activated = true;
        
        // Update the UI
        const activateBtn = modal.querySelector('#activateShardBtn');
        if (activateBtn) {
            activateBtn.remove();
        }
        
        // Replace the Nexus Shard section with the activated version
        const shardSection = modal.querySelector('.nexus-shard-section');
        if (shardSection) {
            shardSection.innerHTML = `
                <h3>Activated Nexus Shard</h3>
                <p>This Nexus Shard has been activated and is now connected to the Galactic Nexus.</p>
                <p>Resource Contributed: <strong>${requiredResource.charAt(0).toUpperCase() + requiredResource.slice(1)}</strong></p>
            `;
            shardSection.className = 'nexus-shard-section activated';
        }
        
        // Update the shard status in the star details
        const shardInfo = modal.querySelector('.nexus-shard-info span');
        if (shardInfo) {
            shardInfo.textContent = 'Activated';
            shardInfo.className = 'activated';
        }
        
        // Add log entry
        const logEntry = document.createElement('p');
        logEntry.textContent = `Nexus Shard activated! You contributed 50 units of ${requiredResource.charAt(0).toUpperCase() + requiredResource.slice(1)}.`;
        explorationLog.appendChild(logEntry);
        
        // Add special effect log entry
        const specialLogEntry = document.createElement('p');
        specialLogEntry.textContent = `The shard emits a brilliant glow and connects to the Galactic Nexus!`;
        specialLogEntry.style.color = '#FFD700';
        specialLogEntry.style.fontWeight = 'bold';
        explorationLog.appendChild(specialLogEntry);
        
        explorationLog.scrollTop = explorationLog.scrollHeight;
        
        // Show system notification
        showSystemMessage(`${currentPlayerName} activated a Nexus Shard at ${star.name}!`);
        
        // Check if all shards are activated
        checkNexusCompletion();
        
        // Update inventory display if open
        updateInventoryDisplay();
    }
    
    // Function to check if all Nexus Shards are activated
    function checkNexusCompletion() {
        const allShards = Object.values(window.nexusShards);
        const allActivated = allShards.every(shard => shard.activated);
        
        if (allActivated) {
            // All shards are activated - trigger the Galactic Nexus event
            showSystemMessage('All Nexus Shards have been activated! The Galactic Nexus is now accessible!', 10000);
            
            // Here you could add additional game mechanics for the Nexus being unlocked
            // For example, revealing a special location, unlocking new abilities, etc.
        }
    }
    
    // Close exploration interface
    function closeExplorationInterface() {
        const modal = document.getElementById('explorationModal');
        if (modal) {
            modal.remove();
        }
    }
    
    // Refuel player when at a star
    function checkForRefuel() {
        for (const star of starSystems) {
            const dx = player.x - star.x;
            const dy = player.y - star.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= star.radius) {
                player.fuel = Math.min(player.maxFuel, player.fuel + 0.5);
                break;
            }
        }
    }
    
    // Main render function
    function render() {
        // Clear canvas
        ctx.clearRect(0, 0, worldWidth, worldHeight);
        
        // Draw background
        drawBackground();
        
        // Draw star systems with their hexagons
        drawStarSystems();
        
        // Draw star system boundaries
        drawStarBoundaries();
        
        // Update and draw player
        updatePlayerPosition();
        
        // Draw the current player
        if (currentPlayer) {
            drawPlayer();
        }
        
        // Draw all players (including the local player)
        drawPlayers();
        
        // Draw mini-map
        drawMiniMap();
        
        // Update pan limit indicator
        updatePanLimitIndicator();
        
        // Update ping positions
        updateAllPingPositions();
        
        // Update explore button position if active
        if (activeExploreButtonStar) {
            updateExploreButtonPosition();
        }
        
        // Debug info - remove after fixing
        if (players.length > 0 && !rocketsDebuggedOnce) {
            console.log("Players in game:", players);
            console.log("Current player:", currentPlayer);
            rocketsDebuggedOnce = true;
        }
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - 100;
        render();
    });
    
    // Mouse down event for panning and selection
    canvas.addEventListener('mousedown', (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldX = (mouseX - worldWidth / 2) / zoom + cameraX;
        const worldY = (mouseY - worldHeight / 2) / zoom + cameraY;
        
        // If ping mode is active, place a ping and return
        if (isPingingActive && event.button === 0) {
            addPing(worldX, worldY, 'Look here!', currentPlayerName);
            
            // In a real implementation, emit to server
            // socket.emit('pingPlaced', { x: worldX, y: worldY, message: 'Look here!', sender: currentPlayerName });
            
            // Deactivate ping mode
            togglePingMode();
            return;
        }
        
        // Right-click is for panning only, never move the rocket
        if (event.button === 2) {
            isDragging = true;
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
            canvas.style.cursor = 'grabbing';
            return;
        }
        
        // Left-click (button 0)
        if (event.button === 0) {
        // Check if clicked on a star system
        let clickedOnStar = false;
        for (const star of starSystems) {
            const dx = worldX - star.x;
            const dy = worldY - star.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= star.radius) {
                selectedStar = star;
                clickedOnStar = true;
                
                // Don't set player target to the star anymore
                // Just update the star info
                updateStarInfo();
                render();
                break;
            }
        }
        
            // If shift key is pressed, it's for panning, not moving the rocket
            if (event.shiftKey) {
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                canvas.style.cursor = 'grabbing';
                return;
            }
            
            // If not clicked on a star and not panning, set player target to clicked position if player has fuel
            if (!clickedOnStar && !isDragging) {
            if (player.fuel > 0) {
                player.targetX = worldX;
                player.targetY = worldY;
                player.isMoving = true;
                render();
                }
            }
            
            // Start panning if not on a star
            if (!clickedOnStar) {
            isDragging = true;
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
            canvas.style.cursor = 'grabbing';
            }
        }
    });
    
    // Mouse move event for panning and hover
    canvas.addEventListener('mousemove', (event) => {
        if (isDragging) {
            const deltaX = (event.clientX - lastMouseX) / zoom;
            const deltaY = (event.clientY - lastMouseY) / zoom;
            
            cameraX -= deltaX;
            cameraY -= deltaY;
            
            // Enforce camera limits
            enforceCameraLimits();
            
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
            
            render();
        } else {
            // Check for star system hover
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // Convert screen coordinates to world coordinates
            const worldX = (mouseX - worldWidth / 2) / zoom + cameraX;
            const worldY = (mouseY - worldHeight / 2) / zoom + cameraY;
            
            let newHoveredStar = null;
            let newHoveredResourceIndicator = null;
            
            for (const star of starSystems) {
                const dx = worldX - star.x;
                const dy = worldY - star.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= star.radius) {
                    newHoveredStar = star;
                    canvas.style.cursor = 'pointer';
                    
                    // Check if hovering over a resource indicator
                    const harvestedResourceTypes = Object.keys(star.harvestedResources);
                    if (harvestedResourceTypes.length > 0) {
                        // Calculate screen position of the star
                        const screenX = (star.x - cameraX) * zoom + worldWidth / 2;
                        const screenY = (star.y - cameraY) * zoom + worldHeight / 2;
                        const scaledRadius = star.radius * zoom;
                        const indicatorRadius = scaledRadius * 0.2;
                        const indicatorDistance = scaledRadius * 1.2;
                        
                        // Check each resource indicator
                        for (let i = 0; i < harvestedResourceTypes.length; i++) {
                            const resourceType = harvestedResourceTypes[i];
                            
                            // Calculate position around the star
                            const angle = (i / harvestedResourceTypes.length) * Math.PI * 2;
                            const indicatorX = screenX + Math.cos(angle) * indicatorDistance;
                            const indicatorY = screenY + Math.sin(angle) * indicatorDistance;
                            
                            // Check if mouse is over this indicator
                            const indicatorDx = mouseX - indicatorX;
                            const indicatorDy = mouseY - indicatorY;
                            const indicatorDistance = Math.sqrt(indicatorDx * indicatorDx + indicatorDy * indicatorDy);
                            
                            if (indicatorDistance <= indicatorRadius * 1.5) {
                                newHoveredResourceIndicator = {
                                    star: star,
                                    resourceType: resourceType,
                                    x: indicatorX,
                                    y: indicatorY
                                };
                                break;
                            }
                        }
                    }
                    
                    break;
                }
            }
            
            if (newHoveredStar !== hoveredStar || newHoveredResourceIndicator !== hoveredResourceIndicator) {
                hoveredStar = newHoveredStar;
                hoveredResourceIndicator = newHoveredResourceIndicator;
                
                if (!hoveredStar) {
                    canvas.style.cursor = 'grab';
                    hideTooltip();
                } else if (hoveredResourceIndicator) {
                    showResourceTooltip(hoveredResourceIndicator);
                } else {
                    hideTooltip();
                }
                
                render();
            }
        }
    });
    
    // Mouse up event for panning
    canvas.addEventListener('mouseup', () => {
        if (isDragging) {
        isDragging = false;
        canvas.style.cursor = hoveredStar ? 'pointer' : 'grab';
        }
    });
    
    // Mouse leave event for panning
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        hoveredStar = null;
        canvas.style.cursor = 'grab';
    });
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        return false;
    });
    
    // Mouse wheel event for zooming
    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        
        // Calculate zoom center (mouse position)
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates before zoom
        const worldXBefore = (mouseX - worldWidth / 2) / zoom + cameraX;
        const worldYBefore = (mouseY - worldHeight / 2) / zoom + cameraY;
        
        // Update zoom level
        const zoomDelta = event.deltaY > 0 ? -0.1 : 0.1;
        zoom = Math.max(minZoom, Math.min(maxZoom, zoom + zoomDelta));
        
        // Convert the same world coordinates back to screen coordinates after zoom
        const screenXAfter = (worldXBefore - cameraX) * zoom + worldWidth / 2;
        const screenYAfter = (worldYBefore - cameraY) * zoom + worldHeight / 2;
        
        // Adjust camera to keep the point under the mouse in the same position
        cameraX += (mouseX - screenXAfter) / zoom;
        cameraY += (mouseY - screenYAfter) / zoom;
        
        // Enforce camera limits
        enforceCameraLimits();
        
        render();
    });
    
    // Add CSS for the explore button and exploration interface
    const style = document.createElement('style');
    style.textContent = `
        .explore-btn {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            transition: background-color 0.3s, transform 0.2s;
            z-index: 1000;
        }
        
        .explore-btn:hover {
            background-color: #45a049;
            transform: scale(1.05);
        }
        
        .explore-btn:active {
            transform: scale(0.98);
        }
        
        /* Exploration Modal Styles */
        .exploration-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        }
        
        .modal-content {
            background-color: #0a0a1a;
            width: 80%;
            max-width: 800px;
            max-height: 90vh;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
            overflow: hidden;
            color: #e0e0e0;
            animation: modalFadeIn 0.3s ease-out;
        }
        
        @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        
        .modal-header {
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
        }
        
        .modal-header h2 {
            margin: 0;
            color: white;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        }
        
        .close-modal {
            color: white;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            transition: color 0.2s;
        }
        
        .close-modal:hover {
            color: #ff4500;
        }
        
        .modal-body {
            padding: 20px;
            max-height: calc(90vh - 130px);
            overflow-y: auto;
        }
        
        .star-info {
            display: flex;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #333;
        }
        
        .star-image {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-right: 20px;
            position: relative;
        }
        
        .star-glow {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.8);
        }
        
        .star-details {
            flex: 1;
        }
        
        .resource-bar-container {
            margin-top: 10px;
        }
        
        .resource-label {
            margin-bottom: 5px;
            font-size: 14px;
            color: #aaa;
        }
        
        .resource-bar-bg {
            height: 15px;
            background-color: #222;
            border-radius: 7px;
            overflow: hidden;
        }
        
        .resource-bar {
            height: 100%;
            background: linear-gradient(to right, #4CAF50, #8BC34A);
            border-radius: 7px;
            transition: width 0.3s ease;
        }
        
        .power-bar {
            height: 100%;
            background: linear-gradient(to right, #2196F3, #03A9F4);
            border-radius: 7px;
            transition: width 0.3s ease;
        }
        
        .exploration-actions {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #333;
        }
        
        .action-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .action-btn {
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .harvest-btn {
            background-color: #4CAF50;
            color: white;
        }
        
        .harvest-btn:hover {
            background-color: #45a049;
        }
        
        .refuel-btn {
            background-color: #2196F3;
            color: white;
        }
        
        .refuel-btn:hover {
            background-color: #0b7dda;
        }
        
        .scan-btn {
            background-color: #9C27B0;
            color: white;
        }
        
        .scan-btn:hover {
            background-color: #7B1FA2;
        }
        
        .exploration-log {
            height: 150px;
        }
        
        .log-content {
            height: 120px;
            overflow-y: auto;
            background-color: #111;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .log-content p {
            margin: 5px 0;
            color: #8bc34a;
        }
        
        .modal-footer {
            padding: 15px 20px;
            display: flex;
            justify-content: flex-end;
            border-top: 1px solid #333;
        }
        
        .leave-btn {
            background-color: #f44336;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .leave-btn:hover {
            background-color: #d32f2f;
        }
        
        /* Resource Map Modal Styles */
        .resource-map-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 3000; /* Higher than exploration modal */
        }
        
        .resource-map-content {
            background-color: #0a0a1a;
            width: 90%;
            max-width: 1000px;
            max-height: 95vh;
            border-radius: 10px;
            box-shadow: 0 0 30px rgba(255, 255, 255, 0.3);
            overflow: hidden;
            color: #e0e0e0;
            animation: modalFadeIn 0.3s ease-out;
            display: flex;
            flex-direction: column;
        }
        
        .resource-map-body {
            display: flex;
            flex: 1;
            overflow: hidden;
            padding: 0;
        }
        
        .resource-map-container {
            flex: 3;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: rgba(0, 0, 0, 0.5);
        }
        
        #resourceMapCanvas {
            max-width: 100%;
            max-height: 100%;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
        }
        
        .resource-selection {
            flex: 2;
            padding: 20px;
            background-color: rgba(20, 20, 40, 0.5);
            overflow-y: auto;
            max-height: 70vh;
        }
        
        .resource-selection h3 {
            margin-top: 0;
            margin-bottom: 15px;
            color: #fff;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            font-size: 18px;
        }
        
        .resource-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .resource-item {
            display: flex;
            align-items: center;
            background-color: rgba(0, 0, 0, 0.3);
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s;
        }
        
        .resource-item:hover {
            background-color: rgba(30, 30, 60, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        
        .resource-item-active {
            background-color: rgba(40, 40, 80, 0.7) !important;
            transform: translateY(-2px);
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
        }
        
        .resource-icon {
            width: 30px;
            height: 30px;
            border-radius: 6px;
            margin-right: 12px;
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
        }
        
        .resource-details {
            flex: 1;
        }
        
        .resource-name {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 4px;
            color: #fff;
        }
        
        .resource-description {
            font-size: 12px;
            color: #aaa;
        }
        
        .resource-amount {
            font-weight: bold;
            font-size: 14px;
            color: #ffeb3b;
            margin: 0 15px;
        }
        
        .harvest-resource-btn {
            background-color: #4CAF50;
            color: white;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .harvest-resource-btn:hover {
            background-color: #45a049;
            transform: scale(1.05);
        }
        
        .harvest-resource-btn:active {
            transform: scale(0.98);
        }
        
        .harvest-resource-btn.depleted {
            background-color: #555;
            cursor: not-allowed;
            opacity: 0.7;
        }
        
        .close-resource-map {
            color: white;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            transition: color 0.2s;
        }
        
        .close-resource-map:hover {
            color: #ff4500;
        }
        
        .done-btn {
            background-color: #2196F3;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .done-btn:hover {
            background-color: #0b7dda;
        }
        
        /* Inventory Styles */
        .inventory-btn {
            background-color: #673AB7;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            transition: all 0.2s;
            z-index: 1000;
        }
        
        .inventory-btn:hover {
            background-color: #5E35B1;
            transform: scale(1.05);
        }
        
        .inventory-display {
            position: absolute;
            top: 140px;
            right: 20px;
            width: 300px;
            background-color: rgba(20, 20, 40, 0.95);
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            z-index: 1001; /* Higher than the inventory button */
            overflow: hidden;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .inventory-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: linear-gradient(to right, #673AB7, #9C27B0);
            color: white;
        }
        
        .inventory-header h3 {
            margin: 0;
            font-size: 18px;
        }
        
        .close-inventory {
            color: white;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            transition: color 0.2s;
        }
        
        .close-inventory:hover {
            color: #ff4500;
        }
        
        .inventory-content {
            padding: 15px;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .inventory-items {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .inventory-item {
            display: flex;
            align-items: center;
            background-color: rgba(255, 255, 255, 0.05);
            padding: 10px;
            border-radius: 5px;
            transition: all 0.2s;
        }
        
        .inventory-item:hover {
            background-color: rgba(255, 255, 255, 0.1);
            transform: translateX(5px);
        }
        
        .inventory-icon {
            width: 25px;
            height: 25px;
            border-radius: 5px;
            margin-right: 10px;
            box-shadow: 0 0 5px rgba(255, 255, 255, 0.2);
        }
        
        .inventory-details {
            flex: 1;
        }
        
        .inventory-name {
            font-weight: bold;
            font-size: 14px;
            color: #fff;
        }
        
        .inventory-amount {
            font-size: 12px;
            color: #ffeb3b;
        }
        
        .empty-inventory {
            color: #888;
            font-style: italic;
            text-align: center;
            padding: 20px 10px;
            line-height: 1.5;
        }
        
        /* Resource Tooltip Styles */
        .resource-tooltip {
            position: absolute;
            width: 200px;
            background-color: rgba(10, 10, 26, 0.9);
            border-radius: 6px;
            box-shadow: 0 0 15px rgba(0, 0, 0, 0.7);
            z-index: 2000;
            overflow: hidden;
            pointer-events: none;
            animation: tooltipFadeIn 0.2s ease-out;
        }
        
        @keyframes tooltipFadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .tooltip-header {
            padding: 8px 12px;
            color: white;
            font-weight: bold;
            font-size: 14px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }
        
        .tooltip-content {
            padding: 10px;
        }
        
        .tooltip-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }
        
        .tooltip-label {
            color: #aaa;
            font-size: 12px;
        }
        
        .tooltip-value {
            color: #fff;
            font-size: 12px;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);
    
    
    // Set initial cursor style
    canvas.style.cursor = 'grab';
    
    // Initialize galaxy and render
    initializeGalaxy();
    
        // Add this function before the animationLoop function in hexMap.js
    function updateMiniMap() {
        const mapSize = 150; // Size of the mini-map (width and height)
        const mapX = worldWidth - mapSize - 20; // Position in bottom-right corner with padding
        const mapY = worldHeight - mapSize - 20;
        const mapScale = mapSize / (galaxyRadius * 2.5); // Scale factor to fit galaxy in mini-map

        // Draw mini-map background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);

        // Center of the mini-map in world coordinates
        const mapCenterX = galaxyCenterX;
        const mapCenterY = galaxyCenterY;

        // Draw star systems
        starSystems.forEach(star => {
            // Convert star position to mini-map coordinates
            const miniX = mapX + (star.x - mapCenterX) * mapScale + mapSize / 2;
            const miniY = mapY + (star.y - mapCenterY) * mapScale + mapSize / 2;

            // Only draw if within mini-map bounds
            if (miniX >= mapX && miniX <= mapX + mapSize && miniY >= mapY && miniY <= mapY + mapSize) {
                ctx.beginPath();
                ctx.arc(miniX, miniY, 2, 0, Math.PI * 2); // Small dot for each star
                ctx.fillStyle = starColors[star.colorIndex][2]; // Use a medium shade from the star's color palette
                ctx.fill();
            }
        });

        // Draw all players
        Object.values(players).forEach(p => {
            const miniX = mapX + (p.x - mapCenterX) * mapScale + mapSize / 2;
            const miniY = mapY + (p.y - mapCenterY) * mapScale + mapSize / 2;

            if (miniX >= mapX && miniX <= mapX + mapSize && miniY >= mapY && miniY <= mapY + mapSize) {
                ctx.beginPath();
                ctx.arc(miniX, miniY, 3, 0, Math.PI * 2); // Slightly larger dot for players
                ctx.fillStyle = getRocketColor(p.rocketType);
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        // Draw camera view rectangle
        const viewWidth = worldWidth / zoom;
        const viewHeight = worldHeight / zoom;
        const viewMiniX = mapX + (cameraX - viewWidth / 2 - mapCenterX) * mapScale + mapSize / 2;
        const viewMiniY = mapY + (cameraY - viewHeight / 2 - mapCenterY) * mapScale + mapSize / 2;
        const viewMiniWidth = viewWidth * mapScale;
        const viewMiniHeight = viewHeight * mapScale;

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(viewMiniX, viewMiniY, viewMiniWidth, viewMiniHeight);
    }

    // Helper function to get rocket color (reuse from drawPlayers if already defined)
    function getRocketColor(rocketType) {
        switch (rocketType) {
            case 'red': return '#FF5252';
            case 'blue': return '#4682B4';
            case 'green': return '#4CAF50';
            case 'yellow': return '#FFD700';
            default: return '#FFFFFF';
        }
    }
    // Initialize player position in empty space
    function initializePlayerPosition() {
        // Try to find a safe position for the player
        let safePositionFound = false;
        let attempts = 0;
        const maxAttempts = 100; // Prevent infinite loop
        
        while (!safePositionFound && attempts < maxAttempts) {
            // Generate a random position within a reasonable distance from center
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * galaxyRadius * 0.5; // Half the galaxy radius
            
            const testX = galaxyCenterX + Math.cos(angle) * distance;
            const testY = galaxyCenterY + Math.sin(angle) * distance;
            
            // Check if this position is inside any star
            let insideStar = false;
            for (const star of starSystems) {
                const dx = testX - star.x;
                const dy = testY - star.y;
                const distanceToStar = Math.sqrt(dx * dx + dy * dy);
                
                // Add a buffer zone around the star
                if (distanceToStar <= star.radius + player.size) {
                    insideStar = true;
                    break;
                }
            }
            
            // If not inside any star, use this position
            if (!insideStar) {
                player.x = testX;
                player.y = testY;
                player.targetX = testX;
                player.targetY = testY;
                safePositionFound = true;
                
                // Center camera on player
                cameraX = player.x;
                cameraY = player.y;
                
                // Important - update the players object with the current player's position
                if (currentPlayerId && players[currentPlayerId]) {
                    players[currentPlayerId].x = player.x;
                    players[currentPlayerId].y = player.y;
                    players[currentPlayerId].targetX = player.targetX;
                    players[currentPlayerId].targetY = player.targetY;
                    players[currentPlayerId].visible = true; // Ensure visibility
                }
            }
            
            attempts++;
        }
        
        // Fallback if no safe position found after max attempts
        if (!safePositionFound) {
            // Place player at a fixed safe distance from the center
            player.x = galaxyRadius * 0.75;
            player.y = 0;
            player.targetX = player.x;
            player.targetY = player.y;
            
            // Center camera on player
            cameraX = player.x;
            cameraY = player.y;
            
            // Important - update the players object with the current player's position
            if (currentPlayerId && players[currentPlayerId]) {
                players[currentPlayerId].x = player.x;
                players[currentPlayerId].y = player.y;
                players[currentPlayerId].targetX = player.targetX;
                players[currentPlayerId].targetY = player.targetY;
                players[currentPlayerId].visible = true; // Ensure visibility
            }
        }
    }
    
    // Initialize player after galaxy is created
    initializePlayerPosition();
    
    render();

    function drawPlayers() {
        // Debug - log drawing attempt
        console.log("Drawing players, count:", Object.keys(players).length);
        
        // Define currentPlayer if it's not already defined
        if (currentPlayerId && players[currentPlayerId] && !currentPlayer) {
            currentPlayer = players[currentPlayerId];
            console.log("Set currentPlayer reference in drawPlayers()");
        }
        
        // Check if players object exists and has entries
        if (!players || Object.keys(players).length === 0) {
            console.warn("No players to draw!");
            return;
        }
        
        // Save the context state
        ctx.save();

        // Draw each player
        Object.values(players).forEach(p => {
            // Skip undefined players or those with missing position data
            if (!p || typeof p.x === 'undefined' || typeof p.y === 'undefined') {
                console.warn("Player missing or has invalid position:", p);
                return;
            }
            
            // Convert world coordinates to screen coordinates
            const screenX = (p.x - cameraX) * zoom + canvas.width / 2;
            const screenY = (p.y - cameraY) * zoom + canvas.height / 2;

            // Skip if off-screen (with expanded boundaries)
            if (screenX < -player.size * zoom * 2 || screenX > canvas.width + player.size * zoom * 2 ||
                screenY < -player.size * zoom * 2 || screenY > canvas.height + player.size * zoom * 2) {
                return;
            }

            // Set rocket rotation (default if not available)
            const rotation = p.rotation || 0;
            
            // Save context for transformations
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(rotation);

            // Determine rocket color based on type
            let rocketColor;
            switch (p.rocketType) {
                case 'red': rocketColor = '#FF5252'; break;
                case 'blue': rocketColor = '#4682B4'; break;
                case 'green': rocketColor = '#4CAF50'; break;
                case 'yellow': rocketColor = '#FFD700'; break;
                default: rocketColor = '#FFFFFF'; // Fallback color
            }

            // Draw rocket (using a simplified triangle shape)
            const rocketSize = player.size * zoom;
            ctx.beginPath();
            ctx.moveTo(0, -rocketSize * 0.5); // Top point
            ctx.lineTo(-rocketSize * 0.3, rocketSize * 0.5); // Bottom left
            ctx.lineTo(rocketSize * 0.3, rocketSize * 0.5); // Bottom right
            ctx.closePath();
            ctx.fillStyle = rocketColor;
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1 * zoom;
            ctx.stroke();

            // Draw engine flame if moving
            if (p.isMoving) {
                ctx.beginPath();
                ctx.moveTo(-rocketSize * 0.2, rocketSize * 0.5);
                ctx.lineTo(0, rocketSize * 0.9);
                ctx.lineTo(rocketSize * 0.2, rocketSize * 0.5);
                ctx.closePath();
                ctx.fillStyle = '#FFA500';
                ctx.fill();
            }

            // Restore context after drawing rocket
            ctx.restore();

            // Draw player name tag
            const playerName = p.name || `Player ${p.id ? p.id.substring(0, 5) : 'Unknown'}`;
            drawPlayerNameTag(screenX, screenY, rocketSize, playerName, p.rocketType);
            
            // Debug - draw a circle around the player's position for visibility
            ctx.beginPath();
            ctx.arc(screenX, screenY, rocketSize * 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // Log the current player's position for debugging
        if (currentPlayerId && players[currentPlayerId]) {
            const cp = players[currentPlayerId];
            const screenX = (cp.x - cameraX) * zoom + canvas.width / 2;
            const screenY = (cp.y - cameraY) * zoom + canvas.height / 2;
            console.log(`Current player (${currentPlayerId}) at screen position: ${Math.round(screenX)}, ${Math.round(screenY)}`);
        }

        ctx.restore();
    }

    // Modified drawPlayerNameTag to accept name and rocketType parameters
    function drawPlayerNameTag(x, y, size, name, rocketType) {
        if (!name) return;

        ctx.save();

        const fontSize = Math.max(10, Math.min(16, 12 * zoom));
        ctx.font = `bold ${fontSize}px Arial`;

        const textWidth = ctx.measureText(name).width;
        const padding = 6 * zoom;
        const tagWidth = textWidth + (padding * 2);
        const tagHeight = fontSize + (padding * 1.5);

        const tagX = x + size + (10 * zoom);
        const tagY = y - (tagHeight / 2);

        let tagColor;
        switch (rocketType) {
            case 'red': tagColor = '#FF5252'; break;
            case 'blue': tagColor = '#4682B4'; break;
            case 'green': tagColor = '#4CAF50'; break;
            case 'yellow': tagColor = '#FFD700'; break;
            default: tagColor = '#4682B4';
        }

        ctx.fillStyle = tagColor;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 * zoom;
        roundRect(ctx, tagX, tagY, tagWidth, tagHeight, 4 * zoom, true, true);

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, tagX + (tagWidth / 2), tagY + (tagHeight / 2));

        ctx.beginPath();
        ctx.moveTo(x + (size * 0.5), y);
        ctx.lineTo(tagX, tagY + (tagHeight / 2));
        ctx.stroke();

        ctx.restore();
    }
    
    // Start animation loop
    function animationLoop() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw game elements
        drawBackground();
        drawStarSystems();
        drawStarBoundaries();

        const currentPlayer = players[currentPlayerId];

        // Update and draw all players
        updatePlayerPosition();


        
        // Make sure currentPlayer is defined and points to the right player object
        if (currentPlayerId && players[currentPlayerId]) {
            currentPlayer = players[currentPlayerId];
        }
        
        // Draw the current player's rocket
        if (currentPlayer) {
            drawPlayer();
        }
        
        // Draw all players' rockets (including other players)
        drawPlayers();
        
        // Draw other UI elements
        updateAllPingPositions();
        updateMiniMap();
        enforceCameraLimits();
        updatePanLimitIndicator();
        
        // Debug information - remove after fixing
        if (players.length > 0 && !rocketsDebuggedOnce) {
            console.log("Animation loop - Players:", players);
            console.log("Animation loop - Current player:", currentPlayer);
            rocketsDebuggedOnce = true;
        }

        // Continue animation loop
        requestAnimationFrame(animationLoop);
    }
    animationLoop();

    // Function to open the resource harvesting map
    function openResourceHarvestingMap(star, parentModal) {
        // Create resource map modal
        const resourceMapModal = document.createElement('div');
        resourceMapModal.id = 'resourceMapModal';
        resourceMapModal.className = 'resource-map-modal';
        
        // Generate star color for the header
        const starColorIndex = star.colorIndex;
        const headerColor = starColors[starColorIndex][2]; // Middle color from the palette
        
        // Generate resource types based on star type
        const resourceTypes = generateResourceTypes(star);
        
        // Create modal content
        resourceMapModal.innerHTML = `
            <div class="resource-map-content">
                <div class="modal-header" style="background: linear-gradient(to right, #000000, ${headerColor}, #000000);">
                    <h2>Resources of ${star.name}</h2>
                    <span class="close-resource-map">&times;</span>
                </div>
                <div class="resource-map-body">
                    <div class="resource-map-container">
                        <canvas id="resourceMapCanvas" width="500" height="500"></canvas>
                    </div>
                    <div class="resource-selection">
                        <h3>Available Resources</h3>
                        <div class="resource-list">
                            ${resourceTypes.map(resource => `
                                <div class="resource-item" data-resource="${resource.type}">
                                    <div class="resource-icon" style="background-color: ${resource.color};"></div>
                                    <div class="resource-details">
                                        <div class="resource-name">${resource.name}</div>
                                        <div class="resource-description">${resource.description}</div>
                                    </div>
                                    <div class="resource-amount">${resource.amount} units</div>
                                    <button class="harvest-resource-btn" data-resource="${resource.type}" ${resource.amount <= 0 ? 'disabled' : ''}>
                                        ${resource.amount <= 0 ? 'Depleted' : 'Harvest'}
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="doneHarvestingBtn" class="done-btn">Done</button>
                </div>
            </div>
        `;
        
        // Add modal to the document
        document.body.appendChild(resourceMapModal);
        
        // Draw the resource map
        setTimeout(() => {
            drawResourceMap(star, resourceTypes);
            
            // Add hover effects to resource items
            addResourceItemHoverEffects();
        }, 100);
        
        // Add event listeners
        
        // Close button
        resourceMapModal.querySelector('.close-resource-map').addEventListener('click', () => {
            closeResourceMap();
        });
        
        // Done button
        resourceMapModal.querySelector('#doneHarvestingBtn').addEventListener('click', () => {
            closeResourceMap();
        });
        
        // Harvest resource buttons
        const harvestButtons = resourceMapModal.querySelectorAll('.harvest-resource-btn');
        harvestButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const resourceType = event.target.getAttribute('data-resource');
                harvestResource(star, resourceType, resourceTypes, parentModal);
                
                // Update button state if resource is depleted
                const resource = resourceTypes.find(r => r.type === resourceType);
                if (resource && resource.amount <= 0) {
                    button.disabled = true;
                    button.textContent = 'Depleted';
                    button.classList.add('depleted');
                }
            });
        });
        
        // Prevent clicks from propagating
        resourceMapModal.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        // Add the previously harvested section after your available resources
        const harvestHistoryHTML = `
            <div class="previously-harvested">
                <h4>Previously Harvested</h4>
                <div class="harvest-history">
                </div>
            </div>
        `;


        // Update the history display
        updateHarvestHistoryDisplay(star);
    }
    
    // Function to add hover effects to resource items
    function addResourceItemHoverEffects() {
        const resourceItems = document.querySelectorAll('.resource-item');
        const canvas = document.getElementById('resourceMapCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        resourceItems.forEach(item => {
            const resourceType = item.getAttribute('data-resource');
            
            // Add mouseenter event
            item.addEventListener('mouseenter', () => {
                // Highlight corresponding hexagons
                highlightResourceHexagons(resourceType, true);
                
                // Add active class to the item
                item.classList.add('resource-item-active');
            });
            
            // Add mouseleave event
            item.addEventListener('mouseleave', () => {
                // Remove highlight from hexagons
                highlightResourceHexagons(resourceType, false);
                
                // Remove active class from the item
                item.classList.remove('resource-item-active');
            });
        });
    }
    
    // Function to highlight resource hexagons
    function highlightResourceHexagons(resourceType, highlight) {
        const canvas = document.getElementById('resourceMapCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Get the resource hexagons for this type
        if (!window.currentResourceHexagons || !window.currentResourceHexagons[resourceType]) return;
        
        const hexagons = window.currentResourceHexagons[resourceType];
        
        // Redraw all hexagons first to clear previous highlights
        if (highlight) {
            // Redraw all hexagons with reduced opacity
            for (const type in window.currentResourceHexagons) {
                if (type !== resourceType) {
                    const otherHexagons = window.currentResourceHexagons[type];
                    for (const hex of otherHexagons) {
                        // Draw with reduced opacity
                        ctx.globalAlpha = 0.3;
                        drawResourceHexagon(ctx, hex.x, hex.y, 25, hex.color, hex.isHarvested, hex.isDepleted);
                        ctx.globalAlpha = 1.0;
                    }
                }
            }
            
            // Draw highlighted hexagons
            for (const hex of hexagons) {
                // Draw with glow effect
                drawResourceHexagonHighlighted(ctx, hex.x, hex.y, 25, hex.color, hex.isHarvested, hex.isDepleted);
            }
        } else {
            // Redraw all hexagons normally
            for (const type in window.currentResourceHexagons) {
                const typeHexagons = window.currentResourceHexagons[type];
                for (const hex of typeHexagons) {
                    drawResourceHexagon(ctx, hex.x, hex.y, 25, hex.color, hex.isHarvested, hex.isDepleted);
                }
            }
        }
    }
    
    // Function to draw a highlighted resource hexagon
    function drawResourceHexagonHighlighted(ctx, x, y, size, color, isHarvested, isDepleted) {
        // Draw the regular hexagon first
        drawResourceHexagon(ctx, x, y, size, color, isHarvested, isDepleted);
        
        // Add highlight effect
        ctx.save();
        
        // Draw outer glow
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * i;
            const hx = x + size * 1.2 * Math.cos(angle);
            const hy = y + size * 1.2 * Math.sin(angle);
            
            if (i === 0) {
                ctx.moveTo(hx, hy);
            } else {
                ctx.lineTo(hx, hy);
            }
        }
        ctx.closePath();
        
        // Create a glow effect
        const glowGradient = ctx.createRadialGradient(x, y, size, x, y, size * 1.5);
        glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.fill();
        
        // Draw pulsing border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }

    // Function to draw the resource map
    function drawResourceMap(star, resourceTypes) {
        const canvas = document.getElementById('resourceMapCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw star background
        const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
        gradient.addColorStop(0, starColors[star.colorIndex][1]);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Draw depleted sections indicator
        drawDepletedSectionsIndicator(ctx, star, width, height);
        
        // Draw hexagonal grid of resources
        const hexSize = 25;
        const hexWidth = hexSize * 2;
        const hexHeight = Math.sqrt(3) * hexSize;
        const gridRadius = 8; // Number of hexes from center to edge
        
        // Create a mapping of resource positions
        const resourceMap = [];
        
        // Store resource hexagons by type for interaction
        const resourceHexagons = {};
        resourceTypes.forEach(resource => {
            resourceHexagons[resource.type] = [];
        });
        
        // Generate resource positions
        for (let q = -gridRadius; q <= gridRadius; q++) {
            const r1 = Math.max(-gridRadius, -q - gridRadius);
            const r2 = Math.min(gridRadius, -q + gridRadius);
            for (let r = r1; r <= r2; r++) {
                // Convert axial coordinates to pixel coordinates
                const x = width/2 + q * hexWidth * 0.75;
                const y = height/2 + (r + q/2) * hexHeight;
                
                // Calculate distance from center (normalized)
                const distanceFromCenter = Math.sqrt(Math.pow(q, 2) + Math.pow(r, 2) + Math.pow(q * r, 2)) / gridRadius;
                
                // Skip if too close to center or too far from center
                if (distanceFromCenter < 0.2 || distanceFromCenter > 0.95) continue;
                
                // Determine resource type based on position and noise
                const angle = Math.atan2(r, q);
                const noise = Math.sin(q * 0.5 + r * 0.3) * 0.5 + 0.5;
                
                // Distribute resources based on angle and noise
                let resourceIndex;
                if (noise < 0.3) {
                    resourceIndex = Math.floor(angle * resourceTypes.length / (Math.PI * 2) + resourceTypes.length) % resourceTypes.length;
                } else if (noise < 0.6) {
                    resourceIndex = (Math.floor(angle * resourceTypes.length / (Math.PI * 2) + resourceTypes.length) + 1) % resourceTypes.length;
                } else {
                    resourceIndex = (Math.floor(angle * resourceTypes.length / (Math.PI * 2) + resourceTypes.length) + 2) % resourceTypes.length;
                }
                
                // Get resource type
                const resourceType = resourceTypes[resourceIndex].type;
                
                // Check if this resource type has been harvested before
                const isHarvested = star.harvestedResources[resourceType] !== undefined;
                
                // Check if this resource is depleted (amount is 0)
                const isDepleted = resourceTypes[resourceIndex].amount <= 0;
                
                // Create hex object
                const hex = {
                    q: q,
                    r: r,
                    x: x,
                    y: y,
                    resourceType: resourceType,
                    color: resourceTypes[resourceIndex].color,
                    isHarvested: isHarvested,
                    isDepleted: isDepleted
                };
                
                // Add to resource map
                resourceMap.push(hex);
                
                // Add to resource type mapping
                resourceHexagons[resourceType].push(hex);
            }
        }
        
        // Store the resource hexagons in the window for later access
        window.currentResourceHexagons = resourceHexagons;
        
        // Draw hexagons
        for (const hex of resourceMap) {
            drawResourceHexagon(ctx, hex.x, hex.y, hexSize, hex.color, hex.isHarvested, hex.isDepleted);
        }
        
        // Draw legend
        drawResourceLegend(ctx, resourceTypes, width, height);
        
        // Draw harvested resources indicator
        drawHarvestedResourcesIndicator(ctx, star, width, height);
    }
    
    // Function to draw a single resource hexagon
    function drawResourceHexagon(ctx, x, y, size, color, isHarvested, isDepleted) {
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * i;
            corners.push({
                x: x + size * Math.cos(angle),
                y: y + size * Math.sin(angle)
            });
        }
        
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        
        // Use depleted color if resource is depleted
        if (isDepleted) {
            ctx.fillStyle = createDepletedColor(color);
        } else if (isHarvested) {
            ctx.fillStyle = lightenColor(color, 30);
                } else {
            ctx.fillStyle = color;
        }
        
            ctx.fill();
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Add a visual indicator for depleted hexagons
        if (isDepleted) {
            ctx.beginPath();
            ctx.moveTo(x - size/2, y - size/2);
            ctx.lineTo(x + size/2, y + size/2);
            ctx.moveTo(x + size/2, y - size/2);
            ctx.lineTo(x - size/2, y + size/2);
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
        ctx.stroke();
        }
    }
    
    // Function to draw depleted sections indicator
    function drawDepletedSectionsIndicator(ctx, star, width, height) {
        // Check if any hexagons are depleted
        let hasDepletedHexagons = false;
        for (const hex of star.hexagons) {
            if (hex.depleted) {
                hasDepletedHexagons = true;
                break;
            }
        }
        
        if (hasDepletedHexagons) {
            // Draw a simplified representation of the star with depleted sections
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = 80; // Size of the indicator
            
            // Draw star background
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fillStyle = starColors[star.colorIndex][2];
            ctx.fill();
            
            // Group depleted hexagons by resource type
            const depletedSectors = {};
            
            for (const hex of star.hexagons) {
                if (hex.depleted && hex.depletedResource) {
                    if (!depletedSectors[hex.depletedResource]) {
                        depletedSectors[hex.depletedResource] = {
                            color: hex.color,
                            angles: []
                        };
                    }
                    
                    // Calculate angle of this hexagon relative to star center
                    const angle = Math.atan2(hex.relativeY, hex.relativeX);
                    depletedSectors[hex.depletedResource].angles.push(angle);
                }
            }
            
            // Draw depleted sectors
            for (const [resourceType, sector] of Object.entries(depletedSectors)) {
                // Calculate average angle for this resource type
                let sumSin = 0;
                let sumCos = 0;
                
                for (const angle of sector.angles) {
                    sumSin += Math.sin(angle);
                    sumCos += Math.cos(angle);
                }
                
                const avgAngle = Math.atan2(sumSin, sumCos);
                
                // Draw a sector for this depleted resource
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, avgAngle - Math.PI/4, avgAngle + Math.PI/4);
                ctx.closePath();
                
                ctx.fillStyle = sector.color;
                ctx.fill();
                
                // Add a pattern to indicate depletion
                ctx.save();
                
                // Create a pattern of diagonal lines
                const patternSize = 4;
                const patternCanvas = document.createElement('canvas');
                patternCanvas.width = patternSize;
                patternCanvas.height = patternSize;
                const patternCtx = patternCanvas.getContext('2d');
                
                // Draw diagonal lines
                patternCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                patternCtx.lineWidth = 1;
                patternCtx.beginPath();
                patternCtx.moveTo(0, patternSize);
                patternCtx.lineTo(patternSize, 0);
                patternCtx.stroke();
                
                // Create and apply the pattern
                const pattern = ctx.createPattern(patternCanvas, 'repeat');
                
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, avgAngle - Math.PI/4, avgAngle + Math.PI/4);
                ctx.closePath();
                
                ctx.fillStyle = pattern;
                ctx.fill();
                
                ctx.restore();
                
                // Add a label
                const labelX = centerX + Math.cos(avgAngle) * (radius + 20);
                const labelY = centerY + Math.sin(avgAngle) * (radius + 20);
                
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Depleted', labelX, labelY);
            }
            
            // Add a title
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(centerX - 100, centerY - radius - 40, 200, 30);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(centerX - 100, centerY - radius - 40, 200, 30);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Depleted Star Sections', centerX, centerY - radius - 25);
        }
    }
    
    // Function to draw harvested resources indicator
    function drawHarvestedResourcesIndicator(ctx, star, width, height) {
        const harvestedResourceTypes = Object.keys(star.harvestedResources);
        
        if (harvestedResourceTypes.length > 0) {
            // Draw a panel at the top of the map
            const panelHeight = 40;
            const panelY = 10;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(10, panelY, width - 20, panelHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(10, panelY, width - 20, panelHeight);
            
            // Draw title
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('Previously Harvested Resources:', 20, panelY + panelHeight / 2);
            
            // Draw resource indicators
            const startX = 240;
            const iconSize = 15;
            const spacing = 70;
            
            for (let i = 0; i < harvestedResourceTypes.length; i++) {
                const resourceType = harvestedResourceTypes[i];
                const resource = star.harvestedResources[resourceType];
                const x = startX + i * spacing;
                
                // Draw resource icon
                ctx.fillStyle = resource.color;
                ctx.fillRect(x, panelY + panelHeight / 2 - iconSize / 2, iconSize, iconSize);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.strokeRect(x, panelY + panelHeight / 2 - iconSize / 2, iconSize, iconSize);
                
                // Draw resource name and amount
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'left';
                ctx.font = '12px Arial';
                ctx.fillText(`${resource.amount}`, x + iconSize + 5, panelY + panelHeight / 2);
            }
        }
    }
    
    // Function to draw resource legend
    function drawResourceLegend(ctx, resourceTypes, width, height) {
        const legendX = 20;
        const legendY = height - 20 - (resourceTypes.length * 25);
        const legendWidth = 150;
        const legendHeight = resourceTypes.length * 25 + 10;
        
        // Draw legend background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
        
        // Draw legend title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Resource Types:', legendX + 10, legendY + 10);
        
        // Draw resource types
        for (let i = 0; i < resourceTypes.length; i++) {
            const resource = resourceTypes[i];
            const itemY = legendY + 30 + (i * 20);
            
            // Draw color box
            ctx.fillStyle = resource.color;
            ctx.fillRect(legendX + 10, itemY, 15, 15);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.strokeRect(legendX + 10, itemY, 15, 15);
            
            // Draw resource name
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(resource.name, legendX + 35, itemY + 2);
        }
    }

    // Function to generate resource types based on star type
    function generateResourceTypes(star, initialize = false) {
        if (!initialize && star.resourcesByType && Object.keys(star.resourcesByType).length > 0) {
            // Return existing resources if not initializing
            return Object.values(star.resourcesByType);
        }

        const resourceTypes = [];
        const totalResources = star.resources;
        
        // Add resource types based on star type
        switch(star.type) {
            case 'Blue Giant':
                resourceTypes.push({
                    type: 'energy', 
                    name: 'Energy', 
                    description: 'High-energy particles',
                    color: '#FF5252', 
                    amount: Math.floor(totalResources * 0.4)
                });
                resourceTypes.push({
                    type: 'mineral', 
                    name: 'Minerals', 
                    description: 'Rare minerals',
                    color: '#FFD700', 
                    amount: Math.floor(totalResources * 0.3)
                });
                resourceTypes.push({
                    type: 'gas', 
                    name: 'Gas', 
                    description: 'Exotic gases',
                    color: '#87CEEB', 
                    amount: Math.floor(totalResources * 0.3)
                });
                break;
                
            case 'Yellow Dwarf':
                resourceTypes.push({
                    type: 'organic', 
                    name: 'Organic', 
                    description: 'Organic compounds',
                    color: '#4CAF50', 
                    amount: Math.floor(totalResources * 0.4)
                });
                resourceTypes.push({
                    type: 'water',
                    name: 'Water',
                    description: 'Water resources',
                    color: '#4682B4', 
                    amount: Math.floor(totalResources * 0.3)
                });
                resourceTypes.push({
                    type: 'mineral', 
                    name: 'Minerals', 
                    description: 'Common minerals',
                    color: '#FFD700', 
                    amount: Math.floor(totalResources * 0.3)
                });
                break;
                
            case 'Red Dwarf':
                resourceTypes.push({
                    type: 'energy', 
                    name: 'Energy', 
                    description: 'Stable energy sources',
                    color: '#FF5252', 
                    amount: Math.floor(totalResources * 0.3)
                });
                resourceTypes.push({
                    type: 'organic', 
                    name: 'Organic', 
                    description: 'Simple organic compounds',
                    color: '#4CAF50', 
                    amount: Math.floor(totalResources * 0.3)
                });
                resourceTypes.push({
                    type: 'mineral', 
                    name: 'Minerals', 
                    description: 'Dense minerals',
                    color: '#FFD700', 
                    amount: Math.floor(totalResources * 0.4)
                });
                break;
                
            // Add other star types as needed
            default:
                resourceTypes.push({
                    type: 'energy', 
                    name: 'Energy', 
                    description: 'Basic energy',
                    color: '#FF5252', 
                    amount: Math.floor(totalResources * 0.25)
                });
                resourceTypes.push({
                    type: 'water', 
                    name: 'Water', 
                    description: 'Water ice',
                    color: '#4682B4', 
                    amount: Math.floor(totalResources * 0.25)
                });
                resourceTypes.push({
                    type: 'organic', 
                    name: 'Organic', 
                    description: 'Basic organic materials',
                    color: '#4CAF50', 
                    amount: Math.floor(totalResources * 0.25)
                });
                resourceTypes.push({
                    type: 'mineral', 
                    name: 'Minerals', 
                    description: 'Common minerals',
                    color: '#FFD700',
                    amount: Math.floor(totalResources * 0.25)
                });
        }
        
        if (initialize) {
            const resourcesByType = {};
            resourceTypes.forEach(resource => {
                resourcesByType[resource.type] = resource;
            });
            star.resourcesByType = resourcesByType;
        }
        return resourceTypes;
    }

    // Function to harvest a specific resource
    function harvestResource(star, resourceType, resourceTypes, parentModal) {
        // Validation checks
        if (!star || !resourceType) {
            console.error("Invalid star or resource type");
            return 0;
        }

        // Star switching logic
        if (player.currentStar !== star) {
            player.currentStar = star;
            player.chosenResource = null; // Reset chosen resource when moving to a new star
        }

        // Resource specialization check
        if (!player.chosenResource) {
            player.chosenResource = resourceType;
        } else if (player.chosenResource !== resourceType) {
            // Block harvesting if trying to harvest a different resource
            showSystemMessage(`You can only harvest ${player.chosenResource} from this star. Move to another star to harvest ${resourceType}.`);
            return 0;
        }

        // Resource availability check
        const resource = star.resourcesByType[resourceType];
        if (!resource || resource.amount <= 0) {
            showSystemMessage(`No ${resourceType} available to harvest.`);
            return 0;
        }

        // Calculate harvest amount with specialization bonus
        let harvestAmount = Math.min(10, resource.amount);
        const specializedResource = getSpecializedResource(player.rocketType);
        const hasSpecializationBonus = resourceType === specializedResource;
        
        if (hasSpecializationBonus) {
            harvestAmount = Math.ceil(harvestAmount * 1.25);
            showSystemMessage(`Bonus! Your ${player.rocketType} rocket harvested ${harvestAmount} ${resource.name}`);
        }

        // Update star's resource amounts
        resource.amount -= harvestAmount;
        star.resources = Math.max(0, star.resources - harvestAmount);
        const isResourceDepleted = resource.amount <= 0;

        // Update player inventory
        if (!player.inventory[resourceType]) {
            player.inventory[resourceType] = { 
                name: resource.name, 
                amount: 0, 
                color: resource.color 
            };
        }
        player.inventory[resourceType].amount += harvestAmount;

        // Update star's harvested resources tracking
        if (!star.harvestedResources) star.harvestedResources = {};
        if (!star.harvestedResources[resourceType]) {
            star.harvestedResources[resourceType] = { 
                name: resource.name, 
                amount: 0, 
                color: resource.color 
            };
        }
        star.harvestedResources[resourceType].amount += harvestAmount;

        // Contribution to Galactic Hub with retry mechanism
        try {
            const contributionSuccess = contributeToHub(resourceType, harvestAmount);
            
            if (contributionSuccess) {
                showSystemMessage(`Added ${harvestAmount} ${resource.name} to the Galactic Hub!`);
            } else {
                // Retry contribution if failed
                setTimeout(() => {
                    const retrySuccess = contributeToHub(resourceType, harvestAmount);
                    if (retrySuccess) {
                        showSystemMessage(`Successfully added ${harvestAmount} ${resource.name} to the Galactic Hub!`);
                    } else {
                        console.warn(`Failed to contribute ${resourceType} to the Galactic Hub after retry.`);
                    }
                }, 500);
            }
        } catch (error) {
            console.error("Error contributing to hub:", error);
        }

        // Update UI elements
        updateHarvestUI(resourceType, resource, isResourceDepleted);
        
        // Update resource map and visual feedback
        updateResourceMapHexagons(resourceType, isResourceDepleted);
        if (isResourceDepleted) {
            updateStarHexagonsForResource(star, resourceType, resource.color);
        }
        
        // Record harvest history
        try {
            addToHarvestHistory(star, currentPlayerName, resourceType, harvestAmount);
            
            // Send network update if socket is connected
            if (socket && socket.connected) {
                socket.emit('resourceHarvested', {
                    starId: star.id,
                    playerName: currentPlayerName,
                    resourceType: resourceType,
                    amount: harvestAmount
                });
            } else {
                console.warn("Socket not connected, harvest event not broadcast");
            }
        } catch (error) {
            console.error("Error recording harvest history:", error);
        }
        
        // Show harvest message with visual feedback
        showHarvestMessage(star, resourceType, harvestAmount);
        showSystemMessage(`Harvested ${harvestAmount} ${resource.name}`);
        
        return harvestAmount;
    }

    // Helper function to update UI elements after harvesting
    function updateHarvestUI(resourceType, resource, isResourceDepleted) {
        const resourceItem = document.querySelector(`.resource-item[data-resource="${resourceType}"]`);
        if (!resourceItem) return;
        
        // Update amount display
        const amountElement = resourceItem.querySelector('.resource-amount');
        if (amountElement) {
            amountElement.textContent = `${resource.amount} units`;
        }
        
        // Update button styling if resource is depleted
        const harvestBtn = resourceItem.querySelector('.harvest-btn');
        if (harvestBtn && isResourceDepleted) {
            harvestBtn.classList.add('depleted');
            harvestBtn.disabled = true;
            harvestBtn.title = "Resource Depleted";
        }
    }
    
    // Function to update resource hexagons in the resource map
    function updateResourceMapHexagons(resourceType, isDepleted) {
        // Get the canvas and context
        const canvas = document.getElementById('resourceMapCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Get the resource hexagons for this type
        if (!window.currentResourceHexagons || !window.currentResourceHexagons[resourceType]) return;
        
        const hexagons = window.currentResourceHexagons[resourceType];
        
        // Update and redraw each hexagon
        for (const hex of hexagons) {
            // Update the depleted status
            hex.isDepleted = isDepleted;
            hex.isHarvested = true;
            
            // Redraw the hexagon
            drawResourceHexagon(ctx, hex.x, hex.y, 25, hex.color, hex.isHarvested, hex.isDepleted);
        }
    }

    // Function to close the resource map
    function closeResourceMap() {
        const resourceMapModal = document.getElementById('resourceMapModal');
        if (resourceMapModal) {
            resourceMapModal.remove();
        }
    }

    // Function to show a specific player's inventory
    function showPlayerInventory(player) {
        // Check if an inventory is already open and close it
        const existingInventory = document.querySelector('.inventory-display');
        if (existingInventory) {
            existingInventory.remove();
        }
        
        // Create and display inventory UI...
        // Rest of the function
        
        // Fix the tooltip reference issue - initialize it if not defined
        if (typeof tooltip === 'undefined' || !tooltip) {
            hideTooltip(); // This will safely handle the case where tooltip is undefined
        }
    }
    
    // Function to hide tooltip
    function hideTooltip() {
        // Find and remove any existing tooltip elements
        const existingTooltip = document.querySelector('.tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // Reset tooltip variable if it exists in the global scope
        if (typeof tooltip !== 'undefined') {
            tooltip = null;
        }
    }
    
    // Function to update star hexagons for depleted resources
    function updateStarHexagonsForResource(star, resourceType, resourceColor) {
        // Calculate how many hexagons to change based on the star's total hexagons
        // and the proportion of this resource type
        const totalHexagons = star.hexagons.length;
        
        // Determine which hexagons to change
        // We'll use a deterministic approach based on the resource type
        // to ensure the same hexagons change for the same resource
        
        // Create a hash from the resource type to use as a seed
        let hashValue = 0;
        for (let i = 0; i < resourceType.length; i++) {
            hashValue += resourceType.charCodeAt(i);
        }
        
        // Determine the section of the star to change (a wedge/sector)
        const sectorStart = (hashValue % 360) * (Math.PI / 180); // Convert to radians
        const sectorSize = Math.PI / 2; // 90 degrees sector
        
        // Create a depleted color (darker version of the resource color)
        const depletedColor = createDepletedColor(resourceColor);
        
        // Track which hexagons were changed
        const changedHexagons = [];
        
        // Change hexagons in the sector
        for (let i = 0; i < star.hexagons.length; i++) {
            const hex = star.hexagons[i];
            
            // Calculate angle of this hexagon relative to star center
            const angle = Math.atan2(hex.relativeY, hex.relativeX);
            
            // Normalize angle to 0-2π range
            const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
            
            // Check if hexagon is in the sector
            let inSector = false;
            
            // Handle sector that wraps around 0/2π
            if (sectorStart + sectorSize > 2 * Math.PI) {
                inSector = normalizedAngle >= sectorStart || normalizedAngle <= (sectorStart + sectorSize) % (2 * Math.PI);
            } else {
                inSector = normalizedAngle >= sectorStart && normalizedAngle <= sectorStart + sectorSize;
            }
            
            // If in sector and not already changed, change the color
            if (inSector && !hex.depleted) {
                // Store original color if not already stored
                if (!hex.originalColor) {
                    hex.originalColor = hex.color;
                }
                
                // Change to depleted color
                hex.color = depletedColor;
                hex.depleted = true;
                hex.depletedResource = resourceType;
                
                changedHexagons.push(hex);
                
                // Limit the number of hexagons changed at once
                if (changedHexagons.length >= totalHexagons / 8) {
                    break;
                }
            }
        }
    }
    
    // Function to create a depleted color (darker version of the original)
    function createDepletedColor(originalColor) {
        // Convert hex color to RGB
        let r = parseInt(originalColor.slice(1, 3), 16);
        let g = parseInt(originalColor.slice(3, 5), 16);
        let b = parseInt(originalColor.slice(5, 7), 16);
        
        // Darken the color and add a gray tint
        r = Math.floor(r * 0.4);
        g = Math.floor(g * 0.4);
        b = Math.floor(b * 0.4);
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    // Helper function to lighten a color
    function lightenColor(color, percent) {
        // Convert hex to RGB
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        
        // Lighten
        r = Math.min(255, Math.floor(r * (1 + percent / 100)));
        g = Math.min(255, Math.floor(g * (1 + percent / 100)));
        b = Math.min(255, Math.floor(b * (1 + percent / 100)));
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // Helper function to darken a color
    function darkenColor(color, percent) {
        // Convert hex to RGB
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        
        // Darken
        r = Math.max(0, Math.floor(r * (1 - percent / 100)));
        g = Math.max(0, Math.floor(g * (1 - percent / 100)));
        b = Math.max(0, Math.floor(b * (1 - percent / 100)));
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    
    // Helper function to draw rounded rectangles
    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        if (typeof radius === 'undefined') {
            radius = 5;
        }
        
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        
        if (fill) {
            ctx.fill();
        }
        if (stroke) {
            ctx.stroke();
        }
    }

    // New function to activate a Nexus Shard when multiple players are present
    function activateNexusShardWithPlayers(star, playersAtStar) {
        // Activate the shard
        star.shardActivated = true;
        
        // Update the nexus shard data
        if (window.nexusShards && window.nexusShards[star.name]) {
            window.nexusShards[star.name].activated = true;
            window.nexusShards[star.name].activatedBy = playersAtStar.map(p => p.id);
        }
        
        // Create player names string for the message
        const playerNames = playersAtStar.map(p => p.name || `Player ${p.id}`).join(' and ');
        
        // Show system notification
        showSystemMessage(`Nexus Shard activated at ${star.name} by ${playerNames}!`, 5000);
        
        // Add pulse effect animation to the star
        // This could be implemented by adding a CSS class to the star or creating a visual effect
        
        // Check if all shards are activated
        checkNexusCompletion();
    }

    // Function to check if all Nexus Shards are activated and initialize the Cosmic Nexus Core
    function checkNexusCompletion() {
        const allShardsActivated = Object.values(window.nexusShards).every(shard => shard.activated);
        if (allShardsActivated && !window.cosmicNexusActive) {
            initializeCosmicNexusCore();
        }
    }

    // Function to initialize the Cosmic Nexus Core at the Galactic Core
    function initializeCosmicNexusCore() {
        const coreStar = starSystems.find(s => s.type === 'Supermassive');
        if (!coreStar) return;
        
        coreStar.hasNexusCore = true;
        window.cosmicNexusActive = false;
        window.nexusCoreResources = {
            exotic_matter: 50,
            water: 50,
            helium3: 50,
            degenerate_matter: 50,
            rare_isotopes: 50,
            antimatter: 50,
            dark_energy: 50
        };
        window.nexusCoreContributed = { 
            exotic_matter: 0, 
            water: 0, 
            helium3: 0, 
            degenerate_matter: 0, 
            rare_isotopes: 0, 
            antimatter: 0, 
            dark_energy: 0 
        };
        
        showSystemMessage('The Cosmic Nexus Core awakens at the Galactic Core. Power it to unlock new realms!', 8000);
    }

    // Function to update the Nexus Core display in the exploration interface
    function updateNexusCoreDisplay() {
        const nexusResources = document.getElementById('nexusCoreResources');
        if (!nexusResources) return;
        
        nexusResources.innerHTML = Object.entries(window.nexusCoreResources).map(([type, required]) => `
            <div class="resource-goal">
                <div class="resource-goal-label">
                    <span>${type.replace('_', ' ').toUpperCase()}</span>
                    <span>${window.nexusCoreContributed[type]}/${required}</span>
                </div>
                <div class="resource-goal-progress">
                    <div class="resource-goal-bar" style="width: ${(window.nexusCoreContributed[type] / required) * 100}%; background-color: ${getResourceColor(type)};"></div>
                </div>
            </div>
        `).join('');
        
        const activateBtn = document.getElementById('activateNexusBtn');
        if (!activateBtn) return;
        
        const allResourcesMet = Object.entries(window.nexusCoreResources).every(([type, req]) => window.nexusCoreContributed[type] >= req);
        if (allResourcesMet) {
            activateBtn.disabled = false;
            activateBtn.addEventListener('click', startNexusActivation);
        }
    }

    // Function to start the Nexus activation process
    function startNexusActivation() {
        showSystemMessage('Nexus Activation Initiated! All players must converge at the Galactic Core within 10 seconds.', 10000);
        window.nexusActivationWindow = Date.now() + 10000;
        setTimeout(checkNexusActivation, 10000);
    }

    // Function to check if all players are at the Galactic Core for Nexus activation
    function checkNexusActivation() {
        if (Date.now() < window.nexusActivationWindow) return;
        
        const coreStar = starSystems.find(s => s.type === 'Supermassive');
        if (!coreStar) return;
        
        const playersAtCore = Object.values(players).filter(p => 
            Math.sqrt((p.x - coreStar.x) ** 2 + (p.y - coreStar.y) ** 2) <= coreStar.radius
        );
        
        if (playersAtCore.length === Object.keys(players).length) {
            window.cosmicNexusActive = true;
            showSystemMessage('The Cosmic Nexus is fully activated! A new galaxy region awaits.', 10000);
            // Trigger new region generation (future enhancement)
        } else {
            showSystemMessage('Nexus Activation Failed: Not all players were present.', 5000);
        }
    }

    // Function to get color for a specific resource type
    function getResourceColor(type) {
        const colors = {
            exotic_matter: '#00BFFF',
            water: '#1E90FF',
            helium3: '#FF4500',
            degenerate_matter: '#F0F8FF',
            rare_isotopes: '#FF8C00',
            antimatter: '#8A2BE2',
            dark_energy: '#00FA9A'
        };
        return colors[type] || '#FFFFFF';
    }

    // New function to update the collaboration panel
    function updateCollaborationPanel() {
        const teamContributionsList = document.getElementById('teamContributionsList');
        teamContributionsList.innerHTML = '';
        
        // Check if players is defined and is an object
        if (!players || typeof players !== 'object') {
            console.warn('Players object is not defined or not an object');
            return;
        }
        
        // Convert players object to array and sort by total contributions
        const playersArray = Object.values(players).map(player => {
            const totalContributions = player.contributions 
                ? Object.values(player.contributions).reduce((sum, val) => sum + val, 0)
                : 0;
            return { ...player, totalContributions };
        }).sort((a, b) => b.totalContributions - a.totalContributions);
        
        // Iterate over sorted players
        playersArray.forEach((player, index) => {
            const li = document.createElement('li');
            li.id = `team-contribution-${player.id}`;
            
            // Add 'top-contributor' class to top 2 players (if applicable)
            if (index < 2 && player.totalContributions > 0) {
                li.classList.add('top-contributor');
            }
            
            // Create rocket icon
            const rocketIcon = document.createElement('div');
            rocketIcon.className = `player-rocket-icon rocket-${player.rocketType || 'blue'}`;
            
            // Player name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.name;
            
            // Resource contributions
            const resourceDiv = document.createElement('div');
            resourceDiv.className = 'resource-contribution';
            
            if (player.contributions && Object.values(player.contributions).some(val => val > 0)) {
                Object.entries(player.contributions).forEach(([type, amount]) => {
                    if (amount > 0) {
                        const resourceSpan = document.createElement('span');
                        resourceSpan.className = 'resource-item';
                        
                        const icon = document.createElement('span');
                        icon.className = 'resource-icon';
                        icon.style.backgroundColor = hubGoals[type]?.color || '#FFFFFF';
                        
                        const amountSpan = document.createElement('span');
                        amountSpan.className = 'resource-amount';
                        amountSpan.textContent = amount;
                        
                        resourceSpan.appendChild(icon);
                        resourceSpan.appendChild(amountSpan);
                        resourceDiv.appendChild(resourceSpan);
                    }
                });
            } else {
                const noContribSpan = document.createElement('span');
                noContribSpan.className = 'no-contribution';
                noContribSpan.textContent = 'No contributions yet';
                resourceDiv.appendChild(noContribSpan);
            }
            
            // Assemble the list item
            li.appendChild(rocketIcon);
            li.appendChild(nameSpan);
            li.appendChild(resourceDiv);
            
            teamContributionsList.appendChild(li);
        });
    }

    // Highlight team contribution
    function highlightTeamContribution(playerId) {
        const contributionElement = document.getElementById(`team-contribution-${playerId}`);
        if (contributionElement) {
            contributionElement.classList.remove('contribution-highlight');
            void contributionElement.offsetWidth; // Trigger reflow
            contributionElement.classList.add('contribution-highlight');
        }
    }

    // Function to reset hub modules to empty state
    function resetHubModules() {
        const modules = document.querySelectorAll('.hub-module');
        modules.forEach(module => {
            const fill = module.querySelector('.module-fill');
            fill.style.height = '0%';
            module.classList.remove('module-complete');
        });
    }

    // Helper function to get specialized resource based on rocket type
    function getSpecializedResource(rocketType) {
        const specializations = {
            'red': 'energy',
            'blue': 'water',
            'green': 'organic',
            'yellow': 'mineral'
        };
        return specializations[rocketType] || '';
    }

    // Add these variables near your other state management variables
    let harvestHistory = new Map(); // Maps star IDs to their harvest history

    // Add this function to manage harvest history
    function addToHarvestHistory(star, playerName, resourceType, amount) {
        if (!harvestHistory.has(star.id)) {
            harvestHistory.set(star.id, []);
        }
        
        const history = harvestHistory.get(star.id);
        history.unshift({
            playerName: playerName,
            resourceType: resourceType,
            amount: amount,
            timestamp: Date.now()
        });

        // Keep only the last 5 harvests
        if (history.length > 5) {
            history.pop();
        }

        updateHarvestHistoryDisplay(star);
    }

    // Add this function to update the display
    function updateHarvestHistoryDisplay(star) {
        const historyContainer = document.querySelector('.previously-harvested .harvest-history');
        if (!historyContainer) return;

        historyContainer.innerHTML = '';
        
        const history = harvestHistory.get(star.id) || [];
        
        history.forEach(entry => {
            const harvestEntry = document.createElement('div');
            harvestEntry.className = 'harvest-entry';
            
            // Format the resource type to be more readable
            const resourceName = entry.resourceType.charAt(0).toUpperCase() + entry.resourceType.slice(1);
            
            harvestEntry.innerHTML = `
                <span class="harvest-player">${entry.playerName}</span>
                <span class="harvest-resource">${resourceName} x${entry.amount}</span>
            `;
            
            historyContainer.appendChild(harvestEntry);
        });
    }

    // Add after line 3174
    // Add this HTML for the toggle button
    const toggleButtonHTML = `
        <button id="toggleCollaborationPanel" class="control-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12,1L3,5v6c0,5.55 3.84,10.74 9,12c5.16-1.26 9-6.45 9-12V5L12,1z M12,11.99h7c-0.53,4.12-3.28,7.79-7,8.94 V12H5V6.3l7-3.11V11.99z"/>
            </svg>
        </button>
    `;

    // Add this HTML for device controls
    const controlsOverlayHTML = `
        <div class="controls-overlay">
            <button id="zoomInBtn" class="control-button">+</button>
            <button id="zoomOutBtn" class="control-button">-</button>
            <button id="inventoryBtn" class="control-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19M17,17H7V7H17V17Z"/>
                </svg>
            </button>
        </div>
    `;

    // Add these new functions
    function toggleCollaborationPanel() {
        const panel = document.getElementById('collaborationPanel');
        panel.classList.toggle('visible');
    }

    function setupControlButtons() {
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const inventoryBtn = document.getElementById('inventoryBtn');
        
        zoomInBtn.addEventListener('click', () => {
            // Simulate keyboard zoom in if that's how your game handles it
            const zoomInEvent = new KeyboardEvent('keydown', {
                key: '+',
                keyCode: 107,
                which: 107,
                code: 'NumpadAdd',
                bubbles: true
            });
            document.dispatchEvent(zoomInEvent);
            
            // Or simulate wheel event if that's how your game handles zoom
            /*
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -100,
                bubbles: true
            });
            document.getElementById('worldMap').dispatchEvent(wheelEvent);
            */
        });
        
        zoomOutBtn.addEventListener('click', () => {
            // Simulate keyboard zoom out
            const zoomOutEvent = new KeyboardEvent('keydown', {
                key: '-',
                keyCode: 109,
                which: 109,
                code: 'NumpadSubtract',
                bubbles: true
            });
            document.dispatchEvent(zoomOutEvent);
            
            // Or simulate wheel event
            /*
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: 100,
                bubbles: true
            });
            document.getElementById('worldMap').dispatchEvent(wheelEvent);
            */
        });
        
        inventoryBtn.addEventListener('click', () => {
            // Show player inventory
            showPlayerInventory(player);
        });
    }

    function setupTouchControls() {
        const canvas = document.getElementById('worldMap');
        
        // Touch variables
        let touchStartX = 0;
        let touchStartY = 0;
        let lastTouchX = 0;
        let lastTouchY = 0;
        let touchMoved = false;
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            lastTouchX = touchStartX;
            lastTouchY = touchStartY;
            touchMoved = false;
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            
            // If moved more than 10px, consider it a drag rather than a tap
            if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                touchMoved = true;
            }
            
            offsetX += deltaX / scale;
            offsetY += deltaY / scale;
            
            enforceCameraLimits();
            updateAllPingPositions();
            
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        });
        
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            // If it wasn't a drag, treat it as a tap/click
            if (!touchMoved) {
                // Convert touch to click position
                const canvasBounds = canvas.getBoundingClientRect();
                const clickX = (lastTouchX - canvasBounds.left) / scale + offsetX;
                const clickY = (lastTouchY - canvasBounds.top) / scale + offsetY;
                
                // Handle the click based on game state
                handleCanvasClick(clickX, clickY);
            }
        });
        
        // Handle pinch to zoom
        let initialPinchDistance = 0;
        
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialPinchDistance = getPinchDistance(e.touches[0], e.touches[1]);
            }
        }, { passive: false });
        
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                const currentDistance = getPinchDistance(e.touches[0], e.touches[1]);
                
                if (initialPinchDistance > 0) {
                    const deltaDistance = currentDistance - initialPinchDistance;
                    if (Math.abs(deltaDistance) > 10) {
                        const zoomFactor = deltaDistance > 0 ? 0.05 : -0.05;
                        if (scale + zoomFactor >= 0.5 && scale + zoomFactor <= 2) {
                            scale += zoomFactor;
                            updateAllPingPositions();
                        }
                        initialPinchDistance = currentDistance;
                    }
                }
            }
        }, { passive: false });
    }

    function getPinchDistance(touch1, touch2) {
        return Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
    }

    function handleCanvasClick(x, y) {
        // Check for star clicks or other interactive elements
        // This function should integrate with your existing click handling logic
        for (const star of stars) {
            const dx = star.x - x;
            const dy = star.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < star.size * 2) {
                // Star clicked - show explore button
                showExploreButton(star);
                return;
            }
        }
        
        // If in ping mode, add a ping
        if (pingMode) {
            addPing(x, y, "", playerName);
            togglePingMode(); // Turn off ping mode after placing
        }
    }

    // Add this to the document ready or initialization section
    function enhanceResponsiveLayout() {
        // Check if we're on a touch device
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            document.body.classList.add('touch-device');
            
            // Add horizontal scroll indicators
            const rocketOptionsContainer = document.querySelector('.rocket-options');
            if (rocketOptionsContainer) {
                const indicator = document.createElement('div');
                indicator.className = 'horizontal-scroll-indicator';
                indicator.innerText = 'Swipe to see more options →';
                rocketOptionsContainer.parentNode.insertBefore(indicator, rocketOptionsContainer.nextSibling);
            }
            
            const playerListContainer = document.getElementById('playerList');
            if (playerListContainer) {
                const indicator = document.createElement('div');
                indicator.className = 'horizontal-scroll-indicator';
                indicator.innerText = 'Swipe to see more players →';
                playerListContainer.parentNode.appendChild(indicator);
            }
            
            // Add touch event for better scroll experience
            addSmoothScrolling(document.querySelector('.rocket-options'));
            addSmoothScrolling(document.getElementById('playerList'));
        }
        
        // Handle orientation changes
        window.addEventListener('resize', function() {
            updateLayoutForScreenSize();
        });
        
        updateLayoutForScreenSize();
    }

    // Add this new function for better horizontal touch scrolling
    function addSmoothScrolling(element) {
        if (!element) return;
        
        let isDragging = false;
        let startX, scrollLeft;
        
        const startDrag = function(e) {
            isDragging = true;
            startX = e.pageX || e.touches[0].pageX;
            scrollLeft = element.scrollLeft;
            element.style.cursor = 'grabbing';
            e.preventDefault();
        };
        
        const drag = function(e) {
            if (!isDragging) return;
            const x = e.pageX || e.touches[0].pageX;
            const walk = (x - startX) * 1.5; // Scrolling speed multiplier
            element.scrollLeft = scrollLeft - walk;
        };
        
        const endDrag = function() {
            isDragging = false;
            element.style.cursor = 'grab';
        };
        
        element.addEventListener('mousedown', startDrag);
        element.addEventListener('touchstart', startDrag);
        
        element.addEventListener('mousemove', drag);
        element.addEventListener('touchmove', drag);
        
        element.addEventListener('mouseup', endDrag);
        element.addEventListener('touchend', endDrag);
        element.addEventListener('mouseleave', endDrag);
    }

    // Update the updateLayoutForScreenSize function
    function updateLayoutForScreenSize() {
        // Check for small screens
        const isSmallScreen = window.innerWidth <= 768;
        
        // Update horizontal scroll indicators visibility
        const indicators = document.querySelectorAll('.horizontal-scroll-indicator');
        indicators.forEach(indicator => {
            indicator.style.display = isSmallScreen ? 'block' : 'none';
        });
        
        // Apply appropriate scroll behavior
        const scrollElements = [
            document.querySelector('.rocket-options'),
            document.getElementById('playerList')
        ];
        
        scrollElements.forEach(element => {
            if (element) {
                if (isSmallScreen) {
                    element.style.overflowX = 'auto';
                } else {
                    element.style.overflowX = 'visible';
                }
            }
        });
    }

    // Call this function at initialization or when the DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        enhanceResponsiveLayout();
    });

    // Add this function to improve the medium-screen layout
    function setupTabletLayout() {
        const hubProgress = document.getElementById('hubProgress');
        const collaborationPanel = document.getElementById('collaborationPanel');
        
        // Only apply these changes on medium-sized screens
        if (window.innerWidth >= 768 && window.innerWidth <= 1366) {
            // Add toggle buttons to expand/collapse panels
            if (hubProgress && !document.getElementById('expandHubBtn')) {
                const expandBtn = document.createElement('button');
                expandBtn.id = 'expandHubBtn';
                expandBtn.className = 'panel-toggle';
                expandBtn.innerHTML = '&raquo;';
                expandBtn.style.cssText = 'position:absolute; right:5px; top:10px; background:none; border:none; color:#FFD700; font-size:16px; cursor:pointer; z-index:10; padding:5px;';
                
                expandBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    hubProgress.classList.toggle('panel-expanded');
                    this.innerHTML = hubProgress.classList.contains('panel-expanded') ? '&laquo;' : '&raquo;';
                });
                
                hubProgress.appendChild(expandBtn);
            }
            
            if (collaborationPanel && !document.getElementById('expandCollabBtn')) {
                const expandBtn = document.createElement('button');
                expandBtn.id = 'expandCollabBtn';
                expandBtn.className = 'panel-toggle';
                expandBtn.innerHTML = '&laquo;';
                expandBtn.style.cssText = 'position:absolute; left:5px; top:10px; background:none; border:none; color:#FFD700; font-size:16px; cursor:pointer; z-index:10; padding:5px;';
                
                expandBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    collaborationPanel.classList.toggle('panel-expanded');
                    this.innerHTML = collaborationPanel.classList.contains('panel-expanded') ? '&raquo;' : '&laquo;';
                });
                
                collaborationPanel.appendChild(expandBtn);
            }
            
            // Make sure panels collapse when clicking away
            document.getElementById('worldMap').addEventListener('click', function() {
                if (hubProgress) hubProgress.classList.remove('panel-expanded');
                if (collaborationPanel) collaborationPanel.classList.remove('panel-expanded');
                
                // Update button text
                const hubBtn = document.getElementById('expandHubBtn');
                const collabBtn = document.getElementById('expandCollabBtn');
                if (hubBtn) hubBtn.innerHTML = '&raquo;';
                if (collabBtn) collabBtn.innerHTML = '&laquo;';
            });
        }
    }

    // Call this from your existing enhanceResponsiveLayout function
    function enhanceResponsiveLayout() {
        // Existing code...
        
        // Add tablet layout improvements
        setupTabletLayout();
        
        // Add window resize handler to update tablet layout
        window.addEventListener('resize', function() {
            setupTabletLayout();
        });
    }

    // Replace or enhance the showSystemMessage function
    function showHarvestMessage(star, resourceType, amount) {
        const color = getResourceColor(resourceType);
        const starPosition = star.screenPosition || getStarScreenPosition(star);
        
        if (!starPosition) return;
        
        // Create a notification that appears above the star
        const notification = document.createElement('div');
        notification.className = `harvest-notification ${resourceType.toLowerCase()}`;
        notification.innerHTML = `<span style="color:${color}">+${amount}</span> ${resourceType}`;
        
        // Position it above the star
        notification.style.left = `${starPosition.x}px`;
        notification.style.top = `${starPosition.y - 50}px`;
        
        // Add to the game container
        document.querySelector('.game-interface').appendChild(notification);
        
        // Remove after animation completes
        setTimeout(() => {
            notification.remove();
        }, 2500);
    }

    // Helper function to get star screen position if not already available
    function getStarScreenPosition(star) {
        // Convert world coordinates to screen coordinates
        return {
            x: (star.x - cameraX) * zoom + canvas.width / 2,
            y: (star.y - cameraY) * zoom + canvas.height / 2
        };
    }

    // Improve setupTouchControls function for iPad compatibility
    function setupTouchControls() {
        const canvas = document.getElementById('worldMap');
        let isDragging = false;
        let lastX, lastY;
        let lastTouchDistance = 0;
        let movementTimeout = null;
        
        // Track if we're in a pinch-zoom gesture
        let isPinching = false;
        
        // Make sure touch events have passive: false to prevent scrolling
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        function handleTouchStart(e) {
            e.preventDefault(); // Prevent default to avoid scrolling
            
            if (e.touches.length === 1) {
                // Single touch - either drag or tap to move
                isDragging = true;
                const touch = e.touches[0];
                lastX = touch.clientX;
                lastY = touch.clientY;
                
                // Set a timeout to check if this is a tap or drag
                movementTimeout = setTimeout(() => {
                    // If we still have touch and haven't moved much, it's a tap-to-move
                    if (isDragging) {
                        const canvasRect = canvas.getBoundingClientRect();
                        const touchX = touch.clientX - canvasRect.left;
                        const touchY = touch.clientY - canvasRect.top;
                        
                        // Convert screen position to world position
                        const worldX = (touchX / zoomLevel) + cameraX;
                        const worldY = (touchY / zoomLevel) + cameraY;
                        
                        // Move player to the tapped location
                        player.targetX = worldX;
                        player.targetY = worldY;
                        player.isMoving = true;
                        
                        // Show a visual indicator at the touch point
                        showTouchIndicator(touchX, touchY);
                    }
                }, 200); // Short delay to differentiate tap from drag
                
            } else if (e.touches.length === 2) {
                // Pinch zoom gesture
                isPinching = true;
                isDragging = false;
                lastTouchDistance = getPinchDistance(e.touches[0], e.touches[1]);
            }
        }
        
        function handleTouchMove(e) {
            e.preventDefault(); // Prevent scrolling
            
            if (e.touches.length === 1 && isDragging) {
                // Clear the timeout since we're moving (not a tap)
                if (movementTimeout) {
                    clearTimeout(movementTimeout);
                    movementTimeout = null;
                }
                
                // Regular dragging (pan camera)
                const touch = e.touches[0];
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                
                // Pan the camera
                cameraX -= dx / zoomLevel;
                cameraY -= dy / zoomLevel;
                
                // Update last position
                lastX = touch.clientX;
                lastY = touch.clientY;
                
            } else if (e.touches.length === 2 && isPinching) {
                // Pinch zoom
                const currentDistance = getPinchDistance(e.touches[0], e.touches[1]);
                const distanceDelta = currentDistance - lastTouchDistance;
                
                // Adjust zoom level based on pinch
                if (Math.abs(distanceDelta) > 5) {
                    const zoomDelta = distanceDelta * 0.005;
                    zoomLevel = Math.max(0.5, Math.min(2.0, zoomLevel + zoomDelta));
                    lastTouchDistance = currentDistance;
                }
            }
        }
        
        function handleTouchEnd(e) {
            // Clear any pending tap timeout
            if (movementTimeout) {
                clearTimeout(movementTimeout);
                movementTimeout = null;
            }
            
            // Handle single-tap movement
            if (isDragging && e.touches.length === 0 && !isPinching) {
                // This was a tap - check if it was short enough to be considered a tap
                const canvasRect = canvas.getBoundingClientRect();
                const touchX = lastX - canvasRect.left;
                const touchY = lastY - canvasRect.top;
                
                // Convert screen position to world position
                const worldX = (touchX / zoomLevel) + cameraX;
                const worldY = (touchY / zoomLevel) + cameraY;
                
                // Check if this is a click on a star
                let clickedOnStar = false;
                for (const star of starSystems) {
                    const distance = Math.sqrt(Math.pow(worldX - star.x, 2) + Math.pow(worldY - star.y, 2));
                    if (distance < star.radius) {
                        clickedOnStar = true;
                        handleCanvasClick(worldX, worldY);
                        break;
                    }
                }
                
                // If not clicking on a star, then move
                if (!clickedOnStar) {
                    player.targetX = worldX;
                    player.targetY = worldY;
                    player.isMoving = true;
                    
                    // Show a visual indicator
                    showTouchIndicator(touchX, touchY);
                }
            }
            
            // Reset flags
            isDragging = false;
            isPinching = false;
        }
        
        // Helper function to show a touch indicator
        function showTouchIndicator(x, y) {
            const indicator = document.createElement('div');
            indicator.className = 'touch-indicator';
            indicator.style.position = 'absolute';
            indicator.style.left = `${x}px`;
            indicator.style.top = `${y}px`;
            indicator.style.width = '20px';
            indicator.style.height = '20px';
            indicator.style.borderRadius = '50%';
            indicator.style.border = '2px solid white';
            indicator.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            indicator.style.transform = 'translate(-50%, -50%)';
            indicator.style.pointerEvents = 'none';
            indicator.style.zIndex = '1000';
            document.body.appendChild(indicator);
            
            // Add animation
            indicator.animate([
                { opacity: 1, transform: 'translate(-50%, -50%) scale(0.5)' },
                { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' }
            ], {
                duration: 1000,
                easing: 'ease-out'
            }).onfinish = () => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            };
        }
        
        // Add alternative movement controls for accessibility
        addDirectionalControls();
    }

    // Add directional control buttons for easier movement on mobile
    function addDirectionalControls() {
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'direction-controls';
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.bottom = '100px';
        controlsContainer.style.right = '20px';
        controlsContainer.style.display = 'grid';
        controlsContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
        controlsContainer.style.gridTemplateRows = 'repeat(3, 1fr)';
        controlsContainer.style.gap = '5px';
        controlsContainer.style.zIndex = '1000';
        
        // Create direction buttons with positions in the grid
        const directions = [
            { dir: 'nw', icon: '↖', row: 1, col: 1 },
            { dir: 'n', icon: '↑', row: 1, col: 2 },
            { dir: 'ne', icon: '↗', row: 1, col: 3 },
            { dir: 'w', icon: '←', row: 2, col: 1 },
            { dir: 'c', icon: '•', row: 2, col: 2 },
            { dir: 'e', icon: '→', row: 2, col: 3 },
            { dir: 'sw', icon: '↙', row: 3, col: 1 },
            { dir: 's', icon: '↓', row: 3, col: 2 },
            { dir: 'se', icon: '↘', row: 3, col: 3 }
        ];
        
        directions.forEach(d => {
            const btn = document.createElement('button');
            btn.innerHTML = d.icon;
            btn.className = 'direction-btn';
            btn.style.width = '40px';
            btn.style.height = '40px';
            btn.style.borderRadius = '50%';
            btn.style.backgroundColor = d.dir === 'c' ? 'rgba(0,0,0,0.2)' : 'rgba(70, 130, 180, 0.7)';
            btn.style.border = 'none';
            btn.style.color = 'white';
            btn.style.fontSize = '18px';
            btn.style.display = 'flex';
            btn.style.justifyContent = 'center';
            btn.style.alignItems = 'center';
            btn.style.gridRow = d.row;
            btn.style.gridColumn = d.col;
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
            
            if (d.dir !== 'c') {
                btn.addEventListener('click', () => movePlayerInDirection(d.dir));
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    movePlayerInDirection(d.dir);
                });
            } else {
                btn.addEventListener('click', () => player.isMoving = false);
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    player.isMoving = false;
                });
            }
            
            controlsContainer.appendChild(btn);
        });
        
        document.body.appendChild(controlsContainer);
    }

    // Helper function to move player in a direction
    function movePlayerInDirection(direction) {
        const moveDistance = 100; // Adjust based on your game scale
        
        // Calculate target based on direction
        switch(direction) {
            case 'n': 
                player.targetY = player.y - moveDistance;
                player.targetX = player.x;
                break;
            case 's': 
                player.targetY = player.y + moveDistance;
                player.targetX = player.x;
                break;
            case 'e': 
                player.targetX = player.x + moveDistance;
                player.targetY = player.y;
                break;
            case 'w': 
                player.targetX = player.x - moveDistance;
                player.targetY = player.y;
                break;
            case 'ne': 
                player.targetX = player.x + moveDistance * 0.7;
                player.targetY = player.y - moveDistance * 0.7;
                break;
            case 'nw': 
                player.targetX = player.x - moveDistance * 0.7;
                player.targetY = player.y - moveDistance * 0.7;
                break;
            case 'se': 
                player.targetX = player.x + moveDistance * 0.7;
                player.targetY = player.y + moveDistance * 0.7;
                break;
            case 'sw': 
                player.targetX = player.x - moveDistance * 0.7;
                player.targetY = player.y + moveDistance * 0.7;
                break;
        }
        
        player.isMoving = true;
        
        // Send position update to server if connected
        if (socket && socket.connected) {
            socket.emit('updatePosition', {
                x: player.targetX,
                y: player.targetY
            });
        }
    }

    function updateStartButton() {
        if (isHost) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = 'Start Game';
        } else {
            startGameBtn.disabled = true;
            startGameBtn.textContent = 'Waiting for host to start...';
        }
    }

    // Add this to the socket event listeners section
    if (socket) {
        // ... existing socket event listeners ...
        
        socket.on('newHost', (data) => {
            console.log(`New host assigned: ${data.name}`);
            if (data.id === socket.id) {
                isHost = true;
                showSystemMessage('You are now the host!');
            }
            updateStartButton();
        });
        
        // ... existing socket event listeners ...
    }

    function updatePlayerMovement() {
        const currentPlayer = players[currentPlayerId];
        
        // Move current player towards target
        if (currentPlayer && currentPlayer.isMoving) {
            const dx = currentPlayer.targetX - currentPlayer.x;
            const dy = currentPlayer.targetY - currentPlayer.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > player.speed) {
                currentPlayer.rotation = Math.atan2(dy, dx);
                currentPlayer.x += Math.cos(currentPlayer.rotation) * player.speed;
                currentPlayer.y += Math.sin(currentPlayer.rotation) * player.speed;
            } else {
                currentPlayer.x = currentPlayer.targetX;
                currentPlayer.y = currentPlayer.targetY;
                currentPlayer.isMoving = false;
            }

            // Update your position on the server
            if (socket && socket.connected) {
                socket.emit('updatePosition', { x: currentPlayer.x, y: currentPlayer.y });
            }
        }

        // Update other players' positions (smooth interpolation)
        Object.values(players).forEach(p => {
            if (p.id !== currentPlayerId && p.isMoving) {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const speed = player.speed; // Use same speed as local player

                if (distance > speed) {
                    p.rotation = Math.atan2(dy, dx);
                    p.x += Math.cos(p.rotation) * speed;
                    p.y += Math.sin(p.rotation) * speed;
                } else {
                    p.x = p.targetX;
                    p.y = p.targetY;
                    p.isMoving = false;
                }
            }
        });

        // Camera follows ONLY the current player's rocket
        if (currentPlayer) {
            cameraX = currentPlayer.x;
            cameraY = currentPlayer.y;
        }
    }
});
