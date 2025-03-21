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
    const players = {}; // Store all players
    let isHost = false; // First player becomes host
    let isGameStarted = false; // Track if game has been started
    
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
        // Connect to server using Socket.io
        socket = io('https://cosmic-collaboration.onrender.com', {
            transports: ['websocket', 'polling'], // Ensure WebSocket is prioritized
            secure: true
        });
        
        socket.on('connect', () => {
            isConnected = true;
            currentPlayerId = socket.id;
            console.log('Connected to server with ID:', currentPlayerId);
        });
        
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            showSystemMessage('Connection error: ' + error.message, 5000);
        });

        socket.on('gameStarted', () => {
            console.log('Received gameStarted event on client:', currentPlayerId, 'isHost:', isHost);
            startGame();
        });
        
        socket.on('playerJoined', (player) => {
            // Add the new player to our local list
            addPlayer(player.id, player.name, player.isHost, player.rocketType);
            
            // If the player already has a position, update it
            if (player.position) {
                updateOtherPlayerPosition(player.id, player.position, player.direction, player.isMoving);
            }
            
            // Show a welcome message
            showSystemMessage(`${player.name} has joined the game!`, 3000);
            
            // If this is the current player and they're the host, enable start button
            if (player.id === currentPlayerId && player.isHost) {
                isHost = true;
                startGameBtn.disabled = false;
                startGameBtn.textContent = 'Start Game';
                console.log('Host status confirmed:', isHost);
            }
        });
        
        // Add missing handler for playerList event
        socket.on('playerList', (playersList) => {
            // Clear existing players first to avoid duplicates
            Object.keys(players).forEach(id => {
                if (id !== currentPlayerId) {
                    delete players[id];
                }
            });
            
            // Add all players from the list
            playersList.forEach(player => {
                // Skip adding the current player again
                if (player.id !== currentPlayerId) {
                    addPlayer(player.id, player.name, player.isHost, player.rocketType);
                } else {
                    // Update our own player's host status
                    players[currentPlayerId].isHost = player.isHost;
                    isHost = player.isHost;
                    
                    // If current player is host, enable the start button
                    if (isHost) {
                        startGameBtn.disabled = false;
                        startGameBtn.textContent = 'Start Game';
                        console.log('You are the host! Start button enabled.');
                    }
                }
            });
            
            // Update the UI
            updatePlayerList();
        });
        
        socket.on('fullGameState', (data) => {
            console.log('Received full game state from server', data);
            
            // Handle full game state information
            if (data.isGameStarted) {
                console.log('Game is already in progress');
                isGameStarted = true;
            }
            
            // Process player information
            data.players.forEach(player => {
                if (player.id !== currentPlayerId) {
                    addPlayer(player.id, player.name, player.isHost, player.rocketType);
                    updateOtherPlayerPosition(player.id, player.position, player.direction, player.isMoving);
                } else {
                    // Update our own player's host status
                    players[currentPlayerId].isHost = player.isHost;
                    isHost = player.isHost;
                    
                    // If current player is host, enable the start button
                    if (isHost) {
                        startGameBtn.disabled = false;
                        startGameBtn.textContent = 'Start Game';
                    }
                }
            });
            
            // Update hub progress if available
            if (data.hubProgress) {
                Object.keys(data.hubProgress).forEach(resourceType => {
                    if (hubGoals[resourceType]) {
                        hubGoals[resourceType].current = data.hubProgress[resourceType].current;
                    }
                });
                updateHubProgress();
            }
            
            // If game is already started, move to game screen
            if (data.isGameStarted && !waitingRoomScreen.classList.contains('active')) {
                console.log('Starting game from fullGameState');
                startGame();
            }
            
            // Update the UI
            updatePlayerList();
        });
        
        socket.on('playerLeft', (data) => {
            if (players[data.id]) {
                const playerName = players[data.id].name;
                const wasHost = players[data.id].isHost;
                
                // Remove player from local list
                removePlayer(data.id);
                
                // Show message about player leaving
                showSystemMessage(`${playerName} has left the game`, 3000);
                
                // If the host left, let users know we're waiting for a new host assignment
                if (wasHost) {
                    showSystemMessage('Host left the game. Assigning a new host...', 3000);
                    console.log('Host disconnected, waiting for new host assignment');
                }
            }
        });
        
        socket.on('gameStarted', () => {
            console.log('Game started event received from server');
            isGameStarted = true;
            startGame();
        });
        
        socket.on('playerMoved', (data) => {
            // Update other player positions in real-time
            if (data.id !== currentPlayerId) {
                updateOtherPlayerPosition(data.id, data.position, data.direction, data.isMoving);
            }
        });
        
        socket.on('playerStoppedMoving', (data) => {
            // Handle when another player stops moving
            if (data.id !== currentPlayerId) {
                stopOtherPlayerMovement(data.id, data.position);
            }
        });
        
        socket.on('gameStateUpdate', (data) => {
            // Periodic update of all player positions
            const { playerPositions, timestamp } = data;
            
            // Update all player positions except current player
            Object.keys(playerPositions).forEach(id => {
                if (id !== currentPlayerId) {
                    const playerData = playerPositions[id];
                    updateOtherPlayerPosition(
                        id, 
                        playerData.position, 
                        playerData.direction, 
                        playerData.isMoving
                    );
                }
            });
        });
        
        socket.on('resourceHarvested', (data) => {
            updatePlayerInventory(data.id, data.resourceType, data.amount);
        });
        
        socket.on('hubContribution', (data) => {
            updateHubProgress(data.resourceType, data.amount);
            highlightPlayerContribution(data.playerId);
        });
        
        socket.on('pingPlaced', (data) => {
            addPing(data.x, data.y, data.message, data.sender);
        });
        
            socket.on('harvestHistoryUpdate', (data) => {
            if (data.starId && data.history) {
                harvestHistory.set(data.starId, data.history);
                if (currentOpenStar && currentOpenStar.id === data.starId) {
                    updateHarvestHistoryDisplay(currentOpenStar);
                }
            }
        });
        
        socket.on('nexusShardActivated', (data) => {
            if (window.nexusShards && window.nexusShards[data.starId]) {
                window.nexusShards[data.starId].activated = true;
                showSystemMessage(`A Nexus Shard has been activated at ${data.starName}!`, 5000);
                checkNexusCompletion();
            }
        });
        
        socket.on('hubComplete', () => {
            showSystemMessage('The Galactic Hub has been completed!', 8000);
            // Additional hub completion logic can go here
        });
        
        socket.on('newHost', (data) => {
            console.log('New host assigned:', data.id);
            
            // First clear all host statuses
            Object.values(players).forEach(p => p.isHost = false);
            
            if (players[data.id]) {
                // Set the new host
                players[data.id].isHost = true;
                
                // If current player is the new host, update local state and UI
                if (data.id === currentPlayerId) {
                    isHost = true;
                    startGameBtn.disabled = false;
                    startGameBtn.textContent = 'Start Game';
                    
                    // Show message and highlight effect for the new host
                    showSystemMessage('You are now the host! You can start the game when ready.', 5000);
                    
                    // Flash the start button to draw attention
                    const flashButton = () => {
                        startGameBtn.classList.add('button-highlight');
                        setTimeout(() => {
                            startGameBtn.classList.remove('button-highlight');
                        }, 500);
                    };
                    
                    // Flash a few times to draw attention
                    flashButton();
                    setTimeout(flashButton, 1000);
                    setTimeout(flashButton, 2000);
                    
                    console.log('This player is now the host!');
                } else {
                    // Message for other players about the new host
                    showSystemMessage(`${players[data.id].name} is now the host`, 3000);
                    console.log(`New host assigned: ${players[data.id].name}`);
                }
                
                // Update the player list in the UI
                updatePlayerList();
            } else {
                console.error('New host not found in player list:', data.id);
                
                // Attempt to recover by requesting updated game state
                setTimeout(() => {
                    socket.emit('requestGameState');
                    console.log('Requested updated game state after host error');
                }, 1000);
            }
        });
        
        socket.on('disconnect', () => {
            isConnected = false;
            showSystemMessage('Disconnected from server. Trying to reconnect...', 5000);
        });
        
        socket.on('reconnect', () => {
            isConnected = true;
            showSystemMessage('Reconnected to server!', 3000);
            
            // Re-register with server
            if (currentPlayerName && selectedRocketType) {
                socket.emit('playerJoin', {
                    playerName: currentPlayerName,
                    rocketType: selectedRocketType
                });
            }
        });
        
        // Request full game state if we're joining an in-progress game
        socket.emit('requestGameState');
    }
    
    // Function to update other players' positions
    function updateOtherPlayerPosition(playerId, position, direction, isMoving) {
        if (!players[playerId]) return;
        
        // Update the player data
        players[playerId].x = position.x;
        players[playerId].y = position.y;
        players[playerId].rotation = direction || 0;
        players[playerId].isMoving = isMoving || false;
        
        // If player is moving, update target position based on direction
        if (isMoving && position.velocity) {
            // Use velocity to predict where they're heading
            const speedFactor = 5; // Adjust based on your game's speed
            players[playerId].targetX = position.x + position.velocity.x * speedFactor;
            players[playerId].targetY = position.y + position.velocity.y * speedFactor;
        } else {
            // If not moving, target is current position
            players[playerId].targetX = position.x;
            players[playerId].targetY = position.y;
        }
    }
    
    // Function to handle when another player stops moving
    function stopOtherPlayerMovement(playerId, position) {
        if (!players[playerId]) return;
        
        // Update the player position and state
        players[playerId].x = position.x;
        players[playerId].y = position.y;
        players[playerId].targetX = position.x;
        players[playerId].targetY = position.y;
        players[playerId].isMoving = false;
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
        
        // Store current player name
        currentPlayerName = name;
        console.log(`Joining game as: ${currentPlayerName} with rocket: ${selectedRocketType}`);
        
        // Add our player locally - host status will be determined by server
        addPlayer(currentPlayerId, name, false, selectedRocketType);
        
        // Emit join event to server
        socket.emit('playerJoin', { 
            playerName: name, 
            rocketType: selectedRocketType 
        });
        
        // Switch to waiting room screen
        switchScreen(loginScreen, waitingRoomScreen);
        
        // Start button is disabled until server confirms host status
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Waiting for host to start...';
        
        // The playerList event from server will set correct host status and enable button if needed
        // (This event is already handled in initializeSocketConnection)
        
        console.log('Waiting for player list and host confirmation from server...');
        
        // Request the current game state just to be sure
        socket.emit('requestGameState');
    }
    
    // Add a player to the list
    function addPlayer(id, name, isPlayerHost = false, rocketType) {
        // Add to players object
        players[id] = {
            id: id,
            name: name,
            isHost: isPlayerHost,
            rocketType: rocketType || 'blue',
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            speed: 5,
            rotation: 0,
            isMoving: false,
            fuel: 100,
            maxFuel: 100,
            inventory: {},
            contributions: { energy: 0, water: 0, organic: 0, mineral: 0 } // Track contributions
        };
        
        // If this is the current player, update the global host status
        if (id === currentPlayerId) {
            isHost = isPlayerHost;
            
            // Update the start button based on host status
            if (isHost) {
                startGameBtn.disabled = false;
                startGameBtn.textContent = 'Start Game';
            } else {
                startGameBtn.disabled = true;
                startGameBtn.textContent = 'Waiting for host to start...';
            }
        }
        
        // Update the UI
        updatePlayerList();
        console.log(`Player added: ${name} (ID: ${id}, Host: ${isPlayerHost}, Current player: ${id === currentPlayerId})`);
    }
    
    // Remove a player
    function removePlayer(id) {
        if (players[id]) {
            delete players[id];
            updatePlayerList();
        }
    }
    
    // Update the player list in the UI
    function updatePlayerList() {
        // Clear the current list
        playerList.innerHTML = '';
        
        // Track if we have a host
        let hasHost = false;
        
        // Add each player to the list
        Object.values(players).forEach(player => {
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
            
            // Mark the host
            if (player.isHost) {
                playerName.textContent += ' (Host)';
                playerName.style.color = '#FFD700';
                hasHost = true;
            }
            
            // Highlight current player
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
        
        // Log the current player list for debugging
        console.log('Player list updated. Players:', Object.keys(players).length, 'Has host:', hasHost);
    }
    
    // Switch between screens
    function switchScreen(fromScreenId, toScreenId) {
        const fromScreen = document.getElementById(fromScreenId);
        const toScreen = document.getElementById(toScreenId);
        try {
            if (!fromScreen || !toScreen) {
                console.error('Invalid screen elements:', { fromScreenId, toScreenId, fromScreen, toScreen });
                return;
            }
            console.log('Switching screen for client', currentPlayerId, 'from', fromScreen.id, 'to', toScreen.id);
            fromScreen.classList.remove('active');
            toScreen.classList.add('active');
            console.log('Screen switch completed. New active screen:', document.querySelector('.active')?.id);
        } catch (error) {
            console.error('Error in switchScreen:', error.message);
        }
    }


    // Start the game
    function startGame() {
        
        // Switch to game screen
        switchScreen(waitingRoomScreen, gameScreen);
        
        // Initialize game elements
        initializeGalaxy();
        initializePlayerPosition();
        initializeHubProgress();
        initializeCosmicNexusCore();
        
        // Start animation loop
        animationLoop();
        
        // Mark game as started
        isGameStarted = true;
        
        // Emit to server that the game has started (only if we're the host and initiating)
        if (isConnected && isHost && waitingRoomScreen.classList.contains('active')) {
            console.log('Sending startGame event to server');
            socket.emit('startGame');
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
        // Ensure the player has enough resources
        if (!player.inventory[resourceType] || player.inventory[resourceType] < amount) {
            showSystemMessage('Not enough ' + resourceType + ' resources!', 3000);
            return false;
        }
        
        // Deduct from player inventory
        player.inventory[resourceType] -= amount;
        
        // Add to player's contribution record
        player.contributions[resourceType] += amount;
        
        // Add to hub resources
        galacticHub.contributedResources[resourceType] += amount;
        
        // Update module fill visuals
        updateModuleFill(resourceType, galacticHub.contributedResources[resourceType] / galacticHub.requiredResources[resourceType] * 100);
        
        // Update progress display
        updateHubProgress();
        
        // Update player contributions display
        updatePlayerContributionsDisplay();
        
        // Show a system message
        showSystemMessage(`You contributed ${amount} ${resourceType} to the Galactic Hub!`, 3000);
        
        // Highlight the contribution
        highlightPlayerContribution(currentPlayerId);
        
        // Check if the hub is complete
        checkHubCompletion();
        
        // Emit to server
        if (isConnected) {
            socket.emit('contributeToHub', { 
                resourceType: resourceType, 
                amount: amount 
            });
        }

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
    
    // Function to broadcast contributions to other players using Socket.io
    function simulateBroadcastContribution(playerId, resourceType, amount) {
        // Emit the contribution event to the server using Socket.io
        socket.emit('hubContribution', {
            playerId: playerId,
            resourceType: resourceType,
            amount: amount
        });
        
        // Still highlight the local player's contribution immediately for responsive UI
        highlightPlayerContribution(playerId);
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
        // Create a unique ID for the ping
        const pingId = Date.now().toString();
        
        // Add to pings array
        pings.push({
            id: pingId,
            x: x,
            y: y,
            message: message,
            sender: sender,
            timestamp: Date.now()
        });
        
        // Create ping visual element
        const pingElement = document.createElement('div');
        pingElement.className = 'map-ping';
        pingElement.id = 'ping-' + pingId;
        document.querySelector('.game-interface').appendChild(pingElement);
        
        // If message provided, add ping label
        if (message) {
            const pingLabel = document.createElement('div');
            pingLabel.className = 'ping-label';
            pingLabel.textContent = `${sender}: ${message}`;
            pingElement.appendChild(pingLabel);
        }
        
        // Position the ping
        updatePingPosition(pings[pings.length - 1], pingElement);
        
        // Auto-remove ping after a while
        setTimeout(() => {
            removePing(pings.find(p => p.id === pingId));
        }, 10000); // 10 seconds
        
        // Emit to server if this is a locally created ping
        if (sender === currentPlayerName && isConnected) {
            socket.emit('addPing', { 
                x: x, 
                y: y, 
                message: message 
            });
        }
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
        // Draw all other players first
        drawOtherPlayers();
        
        // Then draw current player's rocket (main player)
        drawPlayerRocket(player, true);
    }
    
    // New function to draw all other players' rockets
    function drawOtherPlayers() {
        Object.values(players).forEach(otherPlayer => {
            // Skip the current player as we'll draw them separately
            if (otherPlayer.id === currentPlayerId) return;
            
            // Draw the other player's rocket
            drawPlayerRocket(otherPlayer, false);
        });
    }
    
    // Modified function to draw a player rocket (current or other)
    function drawPlayerRocket(playerObj, isCurrentPlayer) {
        // Calculate screen position
        const screenX = (playerObj.x - cameraX) * zoom + worldWidth / 2;
        const screenY = (playerObj.y - cameraY) * zoom + worldHeight / 2;
        const scaledSize = (isCurrentPlayer ? player.size : playerObj.size || player.size) * zoom;
        
        // Skip if off screen
        if (screenX + scaledSize < 0 || screenX - scaledSize > worldWidth ||
            screenY + scaledSize < 0 || screenY - scaledSize > worldHeight) {
            return;
        }
        
        // Save context state
        ctx.save();
        
        // Draw player name tag (before rotation so it stays upright)
        if (isCurrentPlayer) {
        drawPlayerNameTag(screenX, screenY, scaledSize);
        } else {
            drawOtherPlayerNameTag(playerObj, screenX, screenY, scaledSize);
        }
        
        // Translate to rocket position and rotate
        ctx.translate(screenX, screenY);
        ctx.rotate(playerObj.rotation);
        
        // Get rocket color based on type
        let rocketColor;
        switch(playerObj.rocketType) {
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
        if (playerObj.isMoving) {
            // Main engine flame
            const flameLength = scaledSize * (0.7 + Math.random() * 0.3); // Randomize flame length for effect
            
            // Gradient for flame
            const flameGradient = ctx.createLinearGradient(0, scaledSize * 0.6, 0, scaledSize * 0.6 + flameLength);
            flameGradient.addColorStop(0, '#FFFFFF');
            flameGradient.addColorStop(0.3, '#FFDD00');
            flameGradient.addColorStop(0.6, '#FF9900');
            flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            // Draw the flame
            ctx.beginPath();
            ctx.moveTo(-scaledSize * 0.2, scaledSize * 0.6);
            ctx.lineTo(0, scaledSize * 0.6 + flameLength);
            ctx.lineTo(scaledSize * 0.2, scaledSize * 0.6);
            ctx.fillStyle = flameGradient;
            ctx.fill();
            
            // Small side thrusters
            const sideThrustLength = scaledSize * 0.3 * (0.5 + Math.random() * 0.5);
            
            // Left thruster
            const leftThrustGradient = ctx.createLinearGradient(-scaledSize * 0.3, scaledSize * 0.3, -scaledSize * 0.3 - sideThrustLength, scaledSize * 0.3);
            leftThrustGradient.addColorStop(0, '#FFFFFF');
            leftThrustGradient.addColorStop(0.5, '#FFAA00');
            leftThrustGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.moveTo(-scaledSize * 0.3, scaledSize * 0.2);
            ctx.lineTo(-scaledSize * 0.3 - sideThrustLength, scaledSize * 0.3);
            ctx.lineTo(-scaledSize * 0.3, scaledSize * 0.4);
            ctx.fillStyle = leftThrustGradient;
            ctx.fill();
            
            // Right thruster
            const rightThrustGradient = ctx.createLinearGradient(scaledSize * 0.3, scaledSize * 0.3, scaledSize * 0.3 + sideThrustLength, scaledSize * 0.3);
            rightThrustGradient.addColorStop(0, '#FFFFFF');
            rightThrustGradient.addColorStop(0.5, '#FFAA00');
            rightThrustGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.moveTo(scaledSize * 0.3, scaledSize * 0.2);
            ctx.lineTo(scaledSize * 0.3 + sideThrustLength, scaledSize * 0.3);
            ctx.lineTo(scaledSize * 0.3, scaledSize * 0.4);
            ctx.fillStyle = rightThrustGradient;
            ctx.fill();
        }
        
        // Draw rocket body
        ctx.beginPath();
        ctx.moveTo(0, -scaledSize * 0.6); // Nose
        ctx.lineTo(scaledSize * 0.4, scaledSize * 0.4); // Right bottom corner
        ctx.lineTo(scaledSize * 0.2, scaledSize * 0.4); // Right bottom indentation
        ctx.lineTo(0, scaledSize * 0.6); // Bottom center
        ctx.lineTo(-scaledSize * 0.2, scaledSize * 0.4); // Left bottom indentation
        ctx.lineTo(-scaledSize * 0.4, scaledSize * 0.4); // Left bottom corner
        ctx.closePath();
        
        // Shadow for depth
        const gradient = ctx.createLinearGradient(-scaledSize * 0.4, 0, scaledSize * 0.4, 0);
        gradient.addColorStop(0, darkenColor(rocketColor, 30));
        gradient.addColorStop(0.5, rocketColor);
        gradient.addColorStop(1, darkenColor(rocketColor, 30));
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Cockpit/window
        ctx.beginPath();
        ctx.ellipse(0, -scaledSize * 0.2, scaledSize * 0.2, scaledSize * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
        ctx.fill();
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = scaledSize * 0.05;
        ctx.stroke();
        
        // Wing/fin details
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.4, scaledSize * 0.4); // Left bottom corner
        ctx.lineTo(-scaledSize * 0.6, scaledSize * 0.2); // Left wing tip
        ctx.lineTo(-scaledSize * 0.3, scaledSize * 0.1); // Connect back to body
        ctx.fillStyle = lightenColor(rocketColor, 20);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(scaledSize * 0.4, scaledSize * 0.4); // Right bottom corner
        ctx.lineTo(scaledSize * 0.6, scaledSize * 0.2); // Right wing tip
        ctx.lineTo(scaledSize * 0.3, scaledSize * 0.1); // Connect back to body
        ctx.fillStyle = lightenColor(rocketColor, 20);
        ctx.fill();
        
        // Engine details
        ctx.beginPath();
        ctx.moveTo(-scaledSize * 0.2, scaledSize * 0.4);
        ctx.lineTo(-scaledSize * 0.2, scaledSize * 0.6);
        ctx.lineTo(scaledSize * 0.2, scaledSize * 0.6);
        ctx.lineTo(scaledSize * 0.2, scaledSize * 0.4);
        ctx.fillStyle = '#555555';
        ctx.fill();
        
        // Add a light highlight/reflection
        ctx.beginPath();
        ctx.moveTo(0, -scaledSize * 0.6); // Nose
        ctx.lineTo(scaledSize * 0.1, -scaledSize * 0.3); // Right
        ctx.lineTo(0, 0); // Middle
        ctx.lineTo(-scaledSize * 0.1, -scaledSize * 0.3); // Left
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
        
        // Restore context state
        ctx.restore();
        
        // Draw fuel indicator if it's the current player
        if (isCurrentPlayer) {
            // Fuel bar background
            const fuelBarWidth = scaledSize * 3;
            const fuelBarHeight = scaledSize * 0.3;
            const fuelBarX = screenX - fuelBarWidth / 2;
            const fuelBarY = screenY + scaledSize + 10;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            roundRect(ctx, fuelBarX, fuelBarY, fuelBarWidth, fuelBarHeight, 3, true, false);
            
            // Fuel level
            const fuelLevel = Math.max(0, playerObj.fuel / playerObj.maxFuel);
            const fuelWidth = fuelBarWidth * fuelLevel;
            
            // Get color based on fuel level
            let fuelColor;
            if (fuelLevel > 0.6) {
                fuelColor = '#4CAF50'; // Green
            } else if (fuelLevel > 0.3) {
                fuelColor = '#FFC107'; // Yellow/amber
            } else {
                fuelColor = '#F44336'; // Red
            }
            
            ctx.fillStyle = fuelColor;
            roundRect(ctx, fuelBarX, fuelBarY, fuelWidth, fuelBarHeight, 3, true, false);
            
            // Fuel text
            const fuelPercent = Math.floor(fuelLevel * 100);
            const fuelText = `Fuel: ${fuelPercent}%`;
            const textX = screenX;
            const textY = fuelBarY + fuelBarHeight + 15;
            
            ctx.font = `bold ${Math.max(12, 14 * zoom)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Text outline for better visibility
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText(fuelText, textX, textY);
            
            // Text fill
            ctx.fillStyle = 'white';
            ctx.fillText(fuelText, textX, textY);
        }
    }
    
    // Function to draw name tag for other players' rockets
    function drawOtherPlayerNameTag(playerObj, x, y, size) {
        const nameY = y - size - 10;
        ctx.font = `bold ${Math.max(12, 14 * zoom)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Determine player name color based on rocket type
        let nameColor;
        switch(playerObj.rocketType) {
            case 'red':
                nameColor = '#FF5252';
                break;
            case 'green':
                nameColor = '#4CAF50';
                break;
            case 'yellow':
                nameColor = '#FFD700';
                break;
            case 'blue':
            default:
                nameColor = '#4682B4';
                break;
        }
        
        // Draw text outline by offsetting in multiple directions
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(playerObj.name, x, nameY);
        
        // Text fill
        ctx.fillStyle = nameColor;
        ctx.fillText(playerObj.name, x, nameY);
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
                
                // Emit to server that the player has stopped
                if (isConnected) {
                    socket.emit('playerStopMove', { 
                        position: { x: player.x, y: player.y } 
                    });
                }
                
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
                
                // Emit to server that the player has stopped
                if (isConnected) {
                    socket.emit('playerStopMove', { 
                        position: { x: player.x, y: player.y } 
                    });
                }
            } else {
                // Move towards target if no collision
                player.x = nextX;
                player.y = nextY;
                
                // Consume fuel when moving
                player.fuel = Math.max(0, player.fuel - 0.1);
                
                // If out of fuel, stop moving
                if (player.fuel <= 0) {
                    player.isMoving = false;
                    
                    // Emit to server that the player has stopped
                    if (isConnected) {
                        socket.emit('playerStopMove', { 
                            position: { x: player.x, y: player.y } 
                        });
                    }
                } else {
                    // Emit to server about the new position
                    if (isConnected) {
                        socket.emit('playerMove', { 
                            position: { x: player.x, y: player.y },
                            velocity: { x: moveX, y: moveY },
                            direction: player.rotation
                        });
                    }
                    
                    // Hide explore button when moving
                    hideExploreButton();
                }
            }
        }
        
        // Always update camera to follow the player's rocket
        updateCameraToFollowPlayer();
    }
    
    // New function to keep camera centered on player's rocket
    function updateCameraToFollowPlayer() {
        // Update camera position to follow the player
                cameraX = player.x;
                cameraY = player.y;
                
                // Enforce camera limits
                enforceCameraLimits();
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
        drawPlayer();
        
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
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        render();
        updateLayoutForScreenSize();
    });

    // Add new function for better canvas resizing
    function resizeCanvas() {
        const headerHeight = document.querySelector('header') ? document.querySelector('header').offsetHeight : 0;
        const controlsHeight = document.getElementById('gameControls') ? document.getElementById('gameControls').offsetHeight : 0;
        
        // Set canvas dimensions based on available space
        canvas.width = window.innerWidth;
        
        // Calculate height differently based on device type
        if (isMobileDevice()) {
            // On mobile, leave more space for controls
            canvas.height = window.innerHeight - (headerHeight + controlsHeight + 20);
        } else {
            // On desktop, use more screen real estate
            canvas.height = window.innerHeight - (headerHeight + 80);
        }
        
        // Recalculate scale factors for proper rendering
        scaleFactorX = canvas.width / worldWidth;
        scaleFactorY = canvas.height / worldHeight;
        
        // Update mini-map size
        miniMapWidth = Math.min(200, window.innerWidth * 0.2);
        miniMapHeight = Math.min(150, window.innerHeight * 0.2);
        
        // Enforce camera limits based on new dimensions
        enforceCameraLimits();
    }

    // Add function to detect mobile devices
    function isMobileDevice() {
        return (
            ('ontouchstart' in window || navigator.maxTouchPoints > 0) && 
            window.innerWidth <= 1024
        );
    }
    
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
        }
    }
    
    // Initialize player after galaxy is created
    initializePlayerPosition();
    
    render();
    
    // Start animation loop
    function animationLoop() {
        if (player.isMoving) {
            render();
        }
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
        // Find the selected resource in the array
        const resourceIndex = resourceTypes.findIndex(r => r.type === resourceType);
        if (resourceIndex === -1) return;
        
        const resource = resourceTypes[resourceIndex];
        
        // If already harvested, don't allow harvesting again
        if (resource.harvested) {
            showSystemMessage('You have already harvested this resource!', 3000);
            return;
        }
        
        // If depleted, don't allow harvesting
        if (resource.depleted) {
            showSystemMessage('This resource has been depleted!', 3000);
            return;
        }
        
        // Calculate harvest amount based on specialization
        let harvestAmount = resource.amount;
        
        // Specialty bonus: +50% for specialized resource
        const playerSpecialty = getSpecializedResource(player.rocketType);
        if (playerSpecialty === resourceType) {
            harvestAmount = Math.round(harvestAmount * 1.5);
            showSystemMessage(`Specialty bonus! +50% ${resourceType} harvested!`, 3000);
        }
        
        // Add to player inventory
        if (!player.inventory[resourceType]) {
            player.inventory[resourceType] = 0;
        }
        player.inventory[resourceType] += harvestAmount;
        
        // Mark as harvested
        resource.harvested = true;
        
        // There's a 30% chance to deplete the resource for all players
        const isResourceDepleted = Math.random() < 0.3;
        if (isResourceDepleted) {
            resource.depleted = true;
            showSystemMessage(`The ${resourceType} resource has been depleted!`, 3000);
        }
        
        // Update harvest history
        addToHarvestHistory(star, currentPlayerName, resourceType, harvestAmount);
        
        // Show harvest notification
        showHarvestMessage(star, resourceType, harvestAmount);
        
        // Update the UI
        updateHarvestUI(resourceType, resource, isResourceDepleted);
        
        // Update star hexagons to show the resource as harvested
        updateStarHexagonsForResource(star, resourceType, resource.depleted ? createDepletedColor(getResourceColor(resourceType)) : getResourceColor(resourceType));
        
        // Update resource map if present
        updateResourceMapHexagons(resourceType, isResourceDepleted);
        
        // Emit to server
        if (isConnected) {
            socket.emit('harvestResource', { 
                    starId: star.id,
                    resourceType: resourceType,
                amount: harvestAmount,
                isResourceDepleted: isResourceDepleted
            });
        }
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

    // Draw player name tag
    function drawPlayerNameTag(x, y, size) {
        // Only draw if we have a player name
        if (!currentPlayerName) return;
        
        // Save context state
        ctx.save();
        
        // Set font based on zoom level
        const fontSize = Math.max(10, Math.min(16, 12 * zoom));
        ctx.font = `bold ${fontSize}px Arial`;
        
        // Measure text width for background
        const textWidth = ctx.measureText(currentPlayerName).width;
        const padding = 6 * zoom;
        const tagWidth = textWidth + (padding * 2);
        const tagHeight = fontSize + (padding * 1.5);
        
        // Position the tag to the right of the rocket instead of above it
        // This avoids overlap with the fuel gauge
        const tagX = x + size + (10 * zoom);
        const tagY = y - (tagHeight / 2);
        
        // Get rocket color for the tag
        let tagColor;
        switch(player.rocketType) {
            case 'red':
                tagColor = '#FF5252';
                break;
            case 'green':
                tagColor = '#4CAF50';
                break;
            case 'yellow':
                tagColor = '#FFD700';
                break;
            case 'blue':
            default:
                tagColor = '#4682B4';
                break;
        }
        
        // Draw tag background with rocket color
        ctx.fillStyle = tagColor;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 * zoom;
        
        // Draw rounded rectangle for tag
        roundRect(ctx, tagX, tagY, tagWidth, tagHeight, 4 * zoom, true, true);
        
        // Draw text
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentPlayerName, tagX + (tagWidth / 2), tagY + (tagHeight / 2));
        
        // Draw connecting line from tag to rocket
        ctx.beginPath();
        ctx.moveTo(x + (size * 0.5), y);
        ctx.lineTo(tagX, tagY + (tagHeight / 2));
        ctx.stroke();
        
        // Restore context
        ctx.restore();
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
        // Only activate if not already activated
        if (star.hasNexusShard && !star.shardActivated) {
            // Set as activated
        star.shardActivated = true;
        
            // Update Nexus Shard status if it exists
            if (window.nexusShards && window.nexusShards[star.id]) {
                window.nexusShards[star.id].activated = true;
            }
            
            // Show activation message
            const playerNames = playersAtStar.map(p => p.name).join(' and ');
        showSystemMessage(`Nexus Shard activated at ${star.name} by ${playerNames}!`, 5000);
        
            // Check if all shards are now activated
        checkNexusCompletion();
            
            // Emit to server
            if (isConnected) {
                socket.emit('activateNexusShard', { 
                    starId: star.id,
                    starName: star.name,
                    playerIds: playersAtStar.map(p => p.id)
                });
            }
            
            return true;
        }
        
        return false;
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
        let touchStartTime = 0;
        let doubleTapTimer = null;
        let longPressTimer = null;
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            lastTouchX = touchStartX;
            lastTouchY = touchStartY;
            touchMoved = false;
            touchStartTime = Date.now();
            
            // Setup long press timer for context menu
            longPressTimer = setTimeout(() => {
                // Trigger right-click equivalent
                if (!touchMoved) {
                    const mapX = (touch.clientX / scale) - offsetX;
                    const mapY = (touch.clientY / scale) - offsetY;
                    
                    // Toggle ping mode on long press
                    if (!pingMode) {
                        togglePingMode();
                        addPing(mapX, mapY, "", playerName);
                        togglePingMode();
                    }
                }
            }, 800); // 800ms for long press
            
            // Handle double-tap for zoom
            if (doubleTapTimer) {
                clearTimeout(doubleTapTimer);
                doubleTapTimer = null;
                
                // Double tap detected - zoom in
                if (!touchMoved) {
                    const zoomFactor = 1.5;
                    const zoomPoint = {
                        x: (touch.clientX / scale) - offsetX,
                        y: (touch.clientY / scale) - offsetY
                    };
                    
                    // Calculate new offset to zoom toward tap point
                    offsetX = zoomPoint.x - (canvas.width / (scale * zoomFactor)) / 2;
                    offsetY = zoomPoint.y - (canvas.height / (scale * zoomFactor)) / 2;
                    
                    // Update scale
                    scale *= zoomFactor;
                    
                    // Enforce limits
                    enforceCameraLimits();
                    updateAllPingPositions();
                }
            } else {
                doubleTapTimer = setTimeout(() => {
                    doubleTapTimer = null;
                }, 300); // 300ms window for double tap
            }
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
        // Detect device type
        const isMobile = window.innerWidth <= 768;
        const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
        const isDesktop = window.innerWidth > 1024;
        
        // Update body class for CSS targeting
        document.body.classList.remove('mobile-device', 'tablet-device', 'desktop-device');
        
        if (isMobile) {
            document.body.classList.add('mobile-device');
            setupMobileLayout();
        } else if (isTablet) {
            document.body.classList.add('tablet-device');
            setupTabletLayout();
        } else {
            document.body.classList.add('desktop-device');
            setupDesktopLayout();
        }
        
        // Resize canvas to fit current screen
        resizeCanvas();
        
        // Update UI elements for current size
        updateUIForCurrentSize();
        
        // Update horizontal scroll indicators visibility
        const indicators = document.querySelectorAll('.horizontal-scroll-indicator');
        indicators.forEach(indicator => {
            indicator.style.display = isMobile ? 'block' : 'none';
        });
        
        // Apply appropriate scroll behavior
        const scrollElements = [
            document.querySelector('.rocket-options'),
            document.getElementById('playerList')
        ];
        
        scrollElements.forEach(element => {
            if (element) {
                if (isMobile) {
                    element.style.overflowX = 'auto';
                    // Add momentum scrolling for iOS
                    element.style.WebkitOverflowScrolling = 'touch';
                } else {
                    element.style.overflowX = 'visible';
                }
            }
        });
    }

    // Add specific mobile layout adjustments
    function setupMobileLayout() {
        // Create collapsible panels for game UI
        const gameUI = document.querySelectorAll('.game-panel');
        
        gameUI.forEach(panel => {
            // Only add toggle if not already present
            if (!panel.querySelector('.panel-toggle')) {
                const panelHeader = panel.querySelector('h3, h4') || document.createElement('div');
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'panel-toggle mobile-toggle';
                toggleBtn.innerHTML = '−';
                toggleBtn.setAttribute('aria-label', 'Toggle Panel');
                
                // Add toggle functionality
                toggleBtn.addEventListener('click', function() {
                    const panelBody = panel.querySelector('.panel-body');
                    if (panelBody) {
                        const isCollapsed = panelBody.style.display === 'none';
                        panelBody.style.display = isCollapsed ? 'block' : 'none';
                        this.innerHTML = isCollapsed ? '−' : '+';
                    }
                });
                
                if (panelHeader.parentNode === panel) {
                    panelHeader.appendChild(toggleBtn);
                } else {
                    panel.insertBefore(toggleBtn, panel.firstChild);
                }
            }
        });
        
        // Adjust game controls for touch
        const controlButtons = document.querySelectorAll('.control-button');
        controlButtons.forEach(button => {
            button.classList.add('touch-button');
        });
    }

    // Add desktop-specific layout
    function setupDesktopLayout() {
        // Remove mobile-specific classes and styles
        const touchButtons = document.querySelectorAll('.touch-button');
        touchButtons.forEach(button => {
            button.classList.remove('touch-button');
        });
        
        // Ensure all panels are visible
        const panelBodies = document.querySelectorAll('.panel-body');
        panelBodies.forEach(panel => {
            panel.style.display = 'block';
        });
        
        // Update game controls for mouse/keyboard
        setupKeyboardControls();
    }

    // Add improved tablet layout function
    function setupTabletLayout() {
        const hubProgress = document.getElementById('hubProgress');
        const collaborationPanel = document.getElementById('collaborationPanel');
        
            // Add toggle buttons to expand/collapse panels
            if (hubProgress && !document.getElementById('expandHubBtn')) {
                const expandBtn = document.createElement('button');
                expandBtn.id = 'expandHubBtn';
            expandBtn.className = 'panel-toggle tablet-toggle';
                expandBtn.innerHTML = '&raquo;';
            expandBtn.setAttribute('aria-label', 'Expand/Collapse Hub Panel');
                
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
            expandBtn.className = 'panel-toggle tablet-toggle';
                expandBtn.innerHTML = '&laquo;';
            expandBtn.setAttribute('aria-label', 'Expand/Collapse Collaboration Panel');
                
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
        
        // Set up optimal layout for tablet screen size
        const gameControls = document.getElementById('gameControls');
        if (gameControls) {
            gameControls.classList.add('tablet-controls');
        }
        
        // Adjust UI elements for better tablet experience
        const resourceSelectors = document.querySelectorAll('.resource-selector');
        resourceSelectors.forEach(selector => {
            selector.classList.add('tablet-selector');
        });
        
        // Add touch-friendly navigation for tablets
        const navButtons = document.querySelectorAll('.nav-button');
        navButtons.forEach(button => {
            button.classList.add('tablet-nav-button');
        });
    }

    // Add keyboard controls for desktop
    function setupKeyboardControls() {
        // Only add if not already set up
        if (!window.keyboardControlsActive) {
            window.keyboardControlsActive = true;
            
            window.addEventListener('keydown', (e) => {
                const moveSpeed = 20 / scale;
                
                switch(e.key) {
                    case 'ArrowUp':
                    case 'w':
                        offsetY -= moveSpeed;
                        break;
                    case 'ArrowDown':
                    case 's':
                        offsetY += moveSpeed;
                        break;
                    case 'ArrowLeft':
                    case 'a':
                        offsetX -= moveSpeed;
                        break;
                    case 'ArrowRight':
                    case 'd':
                        offsetX += moveSpeed;
                        break;
                    case '+':
                    case '=':
                        scale *= 1.1;
                        break;
                    case '-':
                        scale /= 1.1;
                        break;
                    case 'Escape':
                        if (pingMode) togglePingMode();
                        break;
                    case 'p':
                        togglePingMode();
                        break;
                }
                
                enforceCameraLimits();
                updateAllPingPositions();
                render();
            });
        }
    }

    // Add new function to update UI elements for current screen size
    function updateUIForCurrentSize() {
        // Adjust font sizes based on screen size
        const fontSize = isMobileDevice() ? '14px' : '16px';
        document.documentElement.style.setProperty('--base-font-size', fontSize);
        
        // Adjust button sizes for touch devices
        const buttonSize = isMobileDevice() ? '44px' : '32px';
        document.documentElement.style.setProperty('--button-size', buttonSize);
        
        // Update game panels layout
        const gamePanels = document.querySelectorAll('.game-panel');
        gamePanels.forEach(panel => {
            if (isMobileDevice()) {
                panel.classList.add('compact-panel');
            } else {
                panel.classList.remove('compact-panel');
            }
        });
    }

    // Enhance canvas interaction for both mouse and touch
    function enhanceCanvasInteraction() {
        const canvas = document.getElementById('worldMap');
        
        // Add mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Calculate zoom point (where cursor is)
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Convert to world coordinates
            const worldX = (mouseX / scale) + offsetX;
            const worldY = (mouseY / scale) + offsetY;
            
            // Apply zoom
            const zoomIntensity = 0.1;
            const zoomFactor = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
            
            scale *= zoomFactor;
            
            // Adjust offset to zoom toward mouse position
            offsetX = worldX - (mouseX / scale);
            offsetY = worldY - (mouseY / scale);
            
            // Enforce limits
            enforceCameraLimits();
            updateAllPingPositions();
            render();
        });
    }

    // Call this when initializing
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize responsive layout
        enhanceResponsiveLayout();
        
        // Setup device-specific controls
        if (isMobileDevice()) {
            setupTouchControls();
        } else {
            setupKeyboardControls();
        }
        
        // Enhance canvas interaction
        enhanceCanvasInteraction();
        
        // Initial layout setup
        updateLayoutForScreenSize();
        
        // Initial canvas sizing
        resizeCanvas();
    });

    // Restore harvest message functions
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
}); 
