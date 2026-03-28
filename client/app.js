document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const loginOverlay = document.getElementById("loginOverlay");
    const loginUserIdInput = document.getElementById("loginUserId");
    const loginBtn = document.getElementById("loginBtn");
    const loginError = document.getElementById("loginError");
    
    // Nav Elements
    const navHome = document.getElementById("navHome");
    const navPersonal = document.getElementById("navPersonal");
    
    // View Elements
    const exploreView = document.getElementById("exploreView");
    const personalView = document.getElementById("personalView");
    const displayUserId = document.getElementById("displayUserId");
    
    // Grid Elements
    const exploreGrid = document.getElementById("exploreGrid");
    const movieGrid = document.getElementById("movieGrid");
    const historyGrid = document.getElementById("historyGrid");
    const loader = document.getElementById("loader");
    const statusMsg = document.getElementById("statusMessage");
    
    // Pagination & Filter Elements
    const genreFilter = document.getElementById("genreFilter");
    const prevPageBtn = document.getElementById("prevPage");
    const nextPageBtn = document.getElementById("nextPage");
    const pageCounter = document.getElementById("pageCounter");

    const API_URL = "http://127.0.0.1:8000/recommend";
    
    // Global State
    let activeUserId = null;
    let currentExplorePage = 1;
    let currentGenre = "All";
    let exploreTotalPages = 1;
    
    // Natively generate a mathematical Seed per Browser reload to force the
    // API to perfectly randomize the Matrix without breaking Next/Prev pagination!
    let currentSeed = Math.floor(Math.random() * 999999);

    // Random gorgeous Linear Gradients to replace missing movie posters
    const generateGradient = (id) => {
        const colors = [
            ["#ff9a9e", "#fecfef"], ["#a18cd1", "#fbc2eb"],
            ["#84fab0", "#8fd3f4"], ["#a044ff", "#6a3093"],
            ["#00c6ff", "#0072ff"], ["#ed4264", "#ffedbc"],
            ["#4ca1af", "#c4e0e5"], ["#FF416C", "#FF4B2B"],
            ["#f12711", "#f5af19"], ["#56ab2f", "#a8e063"]
        ];
        const pair = colors[id % colors.length];
        return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
    };

    const renderMovieCards = (movies, containerElement) => {
        containerElement.innerHTML = "";
        if (!movies || movies.length === 0) {
            containerElement.innerHTML = "<p style='color: var(--text-muted);'>No movies found here!</p>";
            return;
        }

        movies.forEach(movie => {
            const card = document.createElement("div");
            card.className = "movie-card";
            
            // TMDB CDN Implementation
            let posterBg = "";
            let titleText = "";
            
            if (movie.poster_url) {
                // Production-grade image binding
                posterBg = `background-image: url('${movie.poster_url}'); background-size: cover; background-position: center;`;
            } else {
                // Fallback deterministic beautiful CSS gradient
                const bgGradient = generateGradient(movie.movie_id);
                posterBg = `background: ${bgGradient};`;
                titleText = movie.title.split(" (")[0]; 
            }
            
            const genresHTML = movie.genres.map(g => `<span class="genre-tag">${g}</span>`).join("");

            let imdbButton = "";
            if (movie.imdb_id) {
                const formatedId = movie.imdb_id.startsWith('tt') ? movie.imdb_id : `tt${movie.imdb_id}`;
                imdbButton = `<a href="https://www.imdb.com/title/${formatedId}/" target="_blank" class="imdb-btn">See on IMDb</a>`;
            }

            card.innerHTML = `
                <div class="poster" style="${posterBg}">
                    ${titleText}
                </div>
                <div class="card-info">
                    <h3 class="m-title">${movie.title}</h3>
                    <div class="genres">
                        ${genresHTML}
                    </div>
                    ${imdbButton}
                </div>
            `;
            containerElement.appendChild(card);
        });
    }

    // ---------------- AUTHENTICATION / LOGIN ---------------- //
    const attemptLogin = () => {
        const idVal = parseInt(loginUserIdInput.value.trim(), 10);
        
        if (isNaN(idVal) || idVal < 1 || idVal > 330975) {
            loginError.textContent = "Invalid ID! Please enter a number between 1 and 330,975.";
            return;
        }
        
        // Success
        activeUserId = idVal;
        loginError.textContent = "";
        displayUserId.textContent = activeUserId;
        
        // Hide Login overlay softly
        loginOverlay.style.opacity = '0';
        setTimeout(() => { loginOverlay.classList.add("hidden"); }, 500);
        
        // Load the general movies immediately
        fetchExploreMovies();
    };

    loginBtn.addEventListener("click", attemptLogin);
    loginUserIdInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") attemptLogin();
    });


    // ---------------- NAVIGATION TABS ---------------- //
    navHome.addEventListener("click", () => {
        navHome.classList.add("active");
        navPersonal.classList.remove("active");
        
        exploreView.classList.remove("hidden");
        personalView.classList.add("hidden");
        statusMsg.textContent = "";
    });

    navPersonal.addEventListener("click", () => {
        navPersonal.classList.add("active");
        navHome.classList.remove("active");
        
        personalView.classList.remove("hidden");
        exploreView.classList.add("hidden");
        
        // Fetch recommendations natively when clicking the tab!
        if (movieGrid.children.length === 0) {
            fetchRecommendations(activeUserId);
        } else {
            statusMsg.textContent = "";
        }
    });


    // ---------------- DATA FETCHING ---------------- //
    const fetchExploreMovies = async () => {
        try {
            exploreGrid.innerHTML = "<p style='color: var(--text-muted); padding: 20px;'>Loading...</p>";
            
            // Build Query Variables into the Fetch string
            const queryParams = new URLSearchParams({
                page: currentExplorePage,
                limit: 24,
                genre: currentGenre,
                seed: currentSeed
            });

            const response = await fetch(`${API_URL}/explore?${queryParams.toString()}`);
            if (!response.ok) throw new Error("Network error");
            const data = await response.json();
            
            exploreTotalPages = data.pages;
            
            if (data.movies.length === 0) {
                exploreGrid.innerHTML = "<p style='color: var(--accent);'>No movies exist in this genre!</p>";
                pageCounter.textContent = "Page 0 of 0";
                prevPageBtn.disabled = true;
                nextPageBtn.disabled = true;
                return;
            }
            
            pageCounter.textContent = `Page ${data.page} of ${exploreTotalPages}`;
            prevPageBtn.disabled = (data.page <= 1);
            nextPageBtn.disabled = (data.page >= exploreTotalPages);
            
            renderMovieCards(data.movies, exploreGrid);
            
        } catch (error) {
            console.error("Explore Fetch Error:", error);
            exploreGrid.innerHTML = "<p style='color: var(--accent);'>Failed to load explore movies. Is FastAPI running?</p>";
        }
    };

    // ---------------- PAGINATION EVENT LISTENERS ---------------- //
    genreFilter.addEventListener("change", (e) => {
        currentGenre = e.target.value;
        currentExplorePage = 1; // Reset to page 1 safely
        fetchExploreMovies();
    });

    prevPageBtn.addEventListener("click", () => {
        if (currentExplorePage > 1 && !prevPageBtn.disabled) {
            currentExplorePage--;
            fetchExploreMovies();
            window.scrollTo({ top: document.getElementById('exploreView').offsetTop - 20, behavior: 'smooth' });
        }
    });

    nextPageBtn.addEventListener("click", () => {
        if (currentExplorePage < exploreTotalPages && !nextPageBtn.disabled) {
            currentExplorePage++;
            fetchExploreMovies();
            window.scrollTo({ top: document.getElementById('exploreView').offsetTop - 20, behavior: 'smooth' });
        }
    });

    const fetchRecommendations = async (userId, isPolling = false) => {
        if (!isPolling) {
            movieGrid.innerHTML = "";
            if (historyGrid) historyGrid.innerHTML = "";
            loader.classList.remove("hidden");
            statusMsg.textContent = "";
        } else {
            statusMsg.textContent = "FAISS Cache missed... Neural Worker is calculating your subspace!...";
        }

        try {
            const response = await fetch(`${API_URL}/${userId}`);
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();

            // 🔥 MAGIC POLLING LOGIC
            if (data.cached === false) {
                setTimeout(() => fetchRecommendations(userId, true), 1000);
                return;
            }

            // SUCCESS!
            loader.classList.add("hidden");
            
            if (isPolling) {
                statusMsg.textContent = "Boom! Worker finished calculation and pushed to Redis!";
                statusMsg.style.color = "#10b981"; // Green
                setTimeout(() => { statusMsg.textContent = ""; }, 3000);
            } else {
                statusMsg.textContent = "Instant Cache Hit! 0.001s response time.";
                statusMsg.style.color = "#3b82f6"; // Blue
                setTimeout(() => { statusMsg.textContent = ""; }, 3000);
            }

            renderMovieCards(data.recommendations, movieGrid);
            if (historyGrid && data.history) {
                renderMovieCards(data.history, historyGrid);
            }

        } catch (error) {
            console.error("Fetch Error:", error);
            loader.classList.add("hidden");
            statusMsg.textContent = "Failed to connect to the API. Is your FastAPI server running on port 8000?";
            statusMsg.style.color = "#e11d48";
        }
    };

});
