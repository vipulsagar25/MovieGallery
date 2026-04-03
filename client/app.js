/**
 * MovieAI — Production Frontend
 * Netflix/Hotstar grade JS with:
 *   ✓ Session-cached API responses (reduce redundant fetches at scale)
 *   ✓ Smart polling with step animations
 *   ✓ AbortController for stale request cancellation
 *   ✓ Skeleton loading cards
 *   ✓ Toast notification system
 *   ✓ Live health/cache stats widget
 */

document.addEventListener("DOMContentLoaded", () => {

    // ── Config (Defaults) ──
    let API = "http://127.0.0.1:8000";
    const POLL_INTERVAL = 1200;  // ms between polls
    const HEALTH_INTERVAL = 8000; // ms between stats pings
    let supabase = null;

    /**
     * Fetch configuration from the backend.
     * This separates secrets (Supabase keys) from the source code.
     */
    async function loadAppConfig() {
        try {
            const res = await fetch(`${API}/config`);
            if (!res.ok) throw new Error("Could not load backend config");
            const config = await res.json();
            
            // Apply Dynamic Config
            if (config.api_url) API = config.api_url;
            
            if (config.supabase_url && config.supabase_anon_key && 
                config.supabase_url !== "https://your-project.supabase.co") {
                supabase = window.supabase.createClient(config.supabase_url, config.supabase_anon_key);
                console.log("Supabase initialized from environment.");
                checkSession(); // Re-run session check once we have keys
            }
        } catch (err) {
            console.warn("Backend configuration missing. Running in limited mode.", err);
        }
    }

    // ── State ──
    let activeUserId       = null;
    let currentGenre       = "All";
    let currentPage        = 1;
    let totalPages         = 1;
    let currentSeed        = Math.floor(Math.random() * 999999);
    let pollTimer          = null;
    let fetchController    = null;
    let personalCached     = false; // prevent re-fetch if already loaded

    // ── DOM ──
    const $  = (id) => document.getElementById(id);
    const loginOverlay    = $("loginOverlay");
    const loginUserIdInp  = $("loginUserId");
    const loginBtn        = $("loginBtn");
    const loginError      = $("loginError");
    
    // New Auth DOM Elements
    const tabEmail        = $("tabEmail");
    const tabDemo         = $("tabDemo");
    const emailAuthSec    = $("emailAuthSection");
    const demoAuthSec     = $("demoAuthSection");
    const loginEmail      = $("loginEmail");
    const loginPassword   = $("loginPassword");
    const signInBtn       = $("signInBtn");
    const signUpLink      = $("signUpLink");
    const randomDemoBtn   = $("randomDemoBtn");
    const logoutBtn       = $("logoutBtn");
    const navHome         = $("navHome");
    const navPersonal     = $("navPersonal");
    const exploreView     = $("exploreView");
    const personalView    = $("personalView");
    const exploreGrid     = $("exploreGrid");
    const movieRow        = $("movieRow");
    const historyRow      = $("historyRow");
    const recsSection     = $("recsSection");
    const histSection     = $("historySection");
    const computingState  = $("computingState");
    const displayUserId   = $("displayUserId");
    const userAvatar      = $("userAvatar");
    const userLabel       = $("userLabel");
    const prevPageBtn     = $("prevPage");
    const nextPageBtn     = $("nextPage");
    const pageCounter     = $("pageCounter");
    const toast           = $("toast");
    const statsWidget     = $("statsWidget");
    const statsDot        = $("statsDot");
    const statsLabel      = $("statsLabel");
    const genreChips      = $("genreChips");
    const recsBadge       = $("recsBadge");
    const histBadge       = $("histBadge");

    // ── Computing Steps ──
    const steps = [$("step1"), $("step2"), $("step3"), $("step4")];
    let stepIndex = 0;

    // ════════════════════════════════════════
    // TOAST
    // ════════════════════════════════════════
    let toastTimer;
    function showToast(msg, type = "info", duration = 3000) {
        toast.textContent = msg;
        toast.className = `toast ${type}`;
        toast.classList.remove("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
    }

    // ════════════════════════════════════════
    // GRADIENT FALLBACK for missing posters
    // ════════════════════════════════════════
    const GRADIENTS = [
        ["#e50914","#b50000"],["#7c3aed","#4c1d95"],["#06b6d4","#0e7490"],
        ["#f59e0b","#b45309"],["#10b981","#065f46"],["#ec4899","#9d174d"],
        ["#6366f1","#3730a3"],["#ef4444","#991b1b"],["#14b8a6","#0f766e"],
        ["#f97316","#c2410c"],
    ];
    const gradientFor = (id) => {
        const [a, b] = GRADIENTS[id % GRADIENTS.length];
        return `linear-gradient(145deg, ${a}, ${b})`;
    };

    // ════════════════════════════════════════
    // SKELETON CARDS
    // ════════════════════════════════════════
    function renderSkeletons(container, count = 10) {
        container.innerHTML = "";
        for (let i = 0; i < count; i++) {
            container.insertAdjacentHTML("beforeend", `
                <div class="movie-card skeleton">
                    <div class="poster-skel"></div>
                    <div class="card-body" style="gap:8px;padding:14px">
                        <div class="skel-line"></div>
                        <div class="skel-line short"></div>
                    </div>
                </div>
            `);
        }
    }

    // ════════════════════════════════════════
    // RENDER MOVIE CARD
    // ════════════════════════════════════════
    function createCard(movie) {
        const card  = document.createElement("div");
        card.className = "movie-card";

        const hasImg = !!movie.poster_url;
        if (!hasImg) card.classList.add("no-img");

        const posterStyle = hasImg
            ? `background-image:url('${movie.poster_url}');background-size:cover;background-position:center;`
            : `background:${gradientFor(movie.movie_id || 0)};`;

        const genresHTML = (movie.genres || []).slice(0,3)
            .map(g => `<span class="genre-tag">${g}</span>`).join("");

        const imdbId = movie.imdb_id
            ? (movie.imdb_id.startsWith("tt") ? movie.imdb_id : `tt${movie.imdb_id}`)
            : null;
        const imdbBtn = imdbId
            ? `<a href="https://www.imdb.com/title/${imdbId}/" target="_blank" class="imdb-btn">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.8 0H9.2L9.2 13.1 6.7 0H.8L.8 24H5.4V9.5L8.4 24H13.2L16.2 9.5V24H20.8V0H14.8Z"/></svg>
                 IMDb
               </a>`
            : "";

        card.innerHTML = `
            <div class="poster" style="${posterStyle}">
                <div class="poster-title">${!hasImg ? movie.title.split(" (")[0] : ""}</div>
            </div>
            <div class="card-body">
                <div class="card-title">${movie.title || "Unknown"}</div>
                <div class="card-genres">${genresHTML}</div>
                ${imdbBtn}
            </div>
        `;
        return card;
    }

    function renderCards(movies, container) {
        container.innerHTML = "";
        if (!movies || movies.length === 0) {
            container.innerHTML = `<p style="color:var(--text-2);padding:8px">No movies found.</p>`;
            return;
        }
        const frag = document.createDocumentFragment();
        movies.forEach(m => frag.appendChild(createCard(m)));
        container.appendChild(frag);
    }

    // ════════════════════════════════════════
    // AUTH TAB SWITCHING
    // ════════════════════════════════════════
    tabEmail.addEventListener("click", () => {
        tabEmail.classList.add("active");
        tabDemo.classList.remove("active");
        emailAuthSec.classList.remove("hidden");
        demoAuthSec.classList.add("hidden");
    });

    tabDemo.addEventListener("click", () => {
        tabDemo.classList.add("active");
        tabEmail.classList.remove("active");
        demoAuthSec.classList.remove("hidden");
        emailAuthSec.classList.add("hidden");
    });

    // ════════════════════════════════════════
    // UUID TO INTEGER HASHING
    // Bridges Supabase UUID -> 1-330,975 Range
    // ════════════════════════════════════════
    function hashUuidToInt(uuid) {
        if (!uuid) return 1;
        let hash = 0;
        for (let i = 0; i < uuid.length; i++) {
            const char = uuid.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        // Map to 1 - 330,975 range
        return Math.abs(hash % 330975) + 1;
    }

    // ════════════════════════════════════════
    // LOGIN / SESSION HELPERS
    // ════════════════════════════════════════
    function finishLogin(id, isSupabase = false) {
        activeUserId = id;
        loginError.textContent = "";

        // Update user UI
        displayUserId.textContent = isSupabase ? "Your Profile" : `User ${id}`;
        userAvatar.textContent = isSupabase ? "✨" : String(id).slice(-2);
        userLabel.textContent  = isSupabase ? "Authenticated" : `User ${id}`;
        
        // Show/Hide logout
        if (isSupabase) logoutBtn.classList.remove("hidden");
        else logoutBtn.classList.add("hidden");

        // Dismiss overlay
        loginOverlay.style.opacity = "0";
        loginOverlay.style.transition = "opacity .5s";
        setTimeout(() => loginOverlay.classList.add("hidden"), 500);

        // Reset cache and load explore
        personalCached = false;
        fetchExplore();
        startHealthPoll();
        
        showToast(isSupabase ? "Logged in via Supabase" : "Demo Mode Active", "success");
    }

    async function handleSupabaseAuth(type = "signin") {
        if (!supabase) {
            loginError.textContent = "Supabase not configured. Please check console.";
            return;
        }

        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();

        if (!email || !password) {
            loginError.textContent = "Email and password are required.";
            return;
        }

        loginError.textContent = type === "signin" ? "Signing in..." : "Creating account...";
        
        try {
            const { data, error } = type === "signin" 
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password });

            if (error) throw error;

            if (type === "signup" && !data.session) {
                showToast("Check your email for confirmation link!", "info");
                loginError.textContent = "Confirmation email sent.";
                return;
            }

            const id = hashUuidToInt(data.user.id);
            finishLogin(id, true);
        } catch (err) {
            loginError.textContent = err.message;
        }
    }

    function handleDemoLogin() {
        const id = parseInt(loginUserIdInp.value.trim(), 10);
        if (isNaN(id) || id < 1 || id > 330975) {
            loginError.textContent = "Enter a valid ID between 1 and 330,975.";
            return;
        }
        finishLogin(id, false);
    }

    function handleRandomDemo() {
        const id = Math.floor(Math.random() * 330975) + 1;
        loginUserIdInp.value = id;
        finishLogin(id, false);
    }

    async function handleLogout() {
        if (supabase) await supabase.auth.signOut();
        activeUserId = null;
        personalCached = false;
        
        // Reset UI and show login
        loginOverlay.classList.remove("hidden");
        loginOverlay.style.opacity = "1";
        logoutBtn.classList.add("hidden");
        
        showToast("Logged out successfully");
    }

    // ── Auth Listeners ──
    signInBtn.addEventListener("click", () => handleSupabaseAuth("signin"));
    signUpLink.addEventListener("click", (e) => {
        e.preventDefault();
        handleSupabaseAuth("signup");
    });
    loginBtn.addEventListener("click", handleDemoLogin);
    randomDemoBtn.addEventListener("click", handleRandomDemo);
    logoutBtn.addEventListener("click", handleLogout);

    // ── Start App ──
    loadAppConfig();

    // ════════════════════════════════════════
    // NAVIGATION
    // ════════════════════════════════════════
    navHome.addEventListener("click", () => {
        navHome.classList.add("active");
        navPersonal.classList.remove("active");
        exploreView.classList.remove("hidden");
        personalView.classList.add("hidden");
    });

    navPersonal.addEventListener("click", () => {
        navPersonal.classList.add("active");
        navHome.classList.remove("active");
        personalView.classList.remove("hidden");
        exploreView.classList.add("hidden");

        // Only fetch if not yet loaded (client-side cache)
        if (!personalCached) {
            startPersonalFetch();
        }
    });

    // ════════════════════════════════════════
    // EXPLORE — Genre chips
    // ════════════════════════════════════════
    genreChips.addEventListener("click", e => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        currentGenre = chip.dataset.genre;
        currentPage  = 1;
        fetchExplore();
    });

    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) { currentPage--; fetchExplore(); }
    });
    nextPageBtn.addEventListener("click", () => {
        if (currentPage < totalPages) { currentPage++; fetchExplore(); }
    });

    // ════════════════════════════════════════
    // EXPLORE FETCH
    // ════════════════════════════════════════
    async function fetchExplore() {
        // Cancel any in-flight explore request
        if (fetchController) fetchController.abort();
        fetchController = new AbortController();

        renderSkeletons(exploreGrid, 24);

        const params = new URLSearchParams({
            page: currentPage, limit: 24,
            genre: currentGenre, seed: currentSeed
        });

        try {
            const res  = await fetch(`${API}/recommend/explore?${params}`, { signal: fetchController.signal });
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();

            totalPages = data.pages || 1;
            pageCounter.textContent = `Page ${data.page} of ${totalPages}`;
            prevPageBtn.disabled = data.page <= 1;
            nextPageBtn.disabled = data.page >= totalPages;

            if (!data.movies || data.movies.length === 0) {
                exploreGrid.innerHTML = `<p style="color:var(--text-2)">No movies in this genre.</p>`;
                return;
            }
            renderCards(data.movies, exploreGrid);
        } catch (err) {
            if (err.name === "AbortError") return;
            exploreGrid.innerHTML = `<p style="color:var(--accent)">⚠️ Could not reach API. Is FastAPI running?</p>`;
        }
    }

    // ════════════════════════════════════════
    // PERSONALIZED — Fetch + Poll
    // ════════════════════════════════════════
    function startPersonalFetch() {
        clearTimeout(pollTimer);
        stepIndex = 0;

        // Reset all sections
        recsSection.classList.add("hidden");
        histSection.classList.add("hidden");
        computingState.classList.remove("hidden");

        // Reset computing steps
        steps.forEach(s => { s.classList.remove("active","done"); });
        steps[0].classList.add("active");

        pollRecommendations();
    }

    async function pollRecommendations(attempt = 0) {
        // Advance computing step animation
        if (attempt > 0 && attempt <= 3) {
            steps[Math.min(attempt - 1, 3)].classList.remove("active");
            steps[Math.min(attempt - 1, 3)].classList.add("done");
            steps[Math.min(attempt, 3)].classList.add("active");
        }

        try {
            const res  = await fetch(`${API}/recommend/${activeUserId}`);
            if (!res.ok) throw new Error("API error");
            const data = await res.json();

            if (data.cached === false) {
                // Still computing — poll again
                pollTimer = setTimeout(() => pollRecommendations(attempt + 1), POLL_INTERVAL);
                return;
            }

            // ── Success ──
            // Mark all steps done
            steps.forEach(s => { s.classList.remove("active"); s.classList.add("done"); });

            setTimeout(() => {
                computingState.classList.add("hidden");

                if (data.recommendations && data.recommendations.length > 0) {
                    recsSection.classList.remove("hidden");
                    recsBadge.textContent = `${data.recommendations.length} movies`;
                    renderCards(data.recommendations, movieRow);
                }

                if (data.history && data.history.length > 0) {
                    histSection.classList.remove("hidden");
                    histBadge.textContent = `${data.history.length} movies`;
                    renderCards(data.history, historyRow);
                }

                personalCached = true;
                const isInstant = attempt === 0;
                showToast(
                    isInstant ? "⚡ Top picks prepared instantly!" : "✅ We've tailored these recommendations for you!",
                    isInstant ? "info" : "success"
                );
            }, 600);

        } catch (err) {
            showToast("⚠️ Could not reach API. Is FastAPI running?", "error");
            computingState.classList.add("hidden");
        }
    }

    // ════════════════════════════════════════
    // STATS WIDGET — live health updates
    // ════════════════════════════════════════
    async function updateStats() {
        try {
            const res = await fetch(`${API}/health`);
            if (!res.ok) throw new Error();
            const data = await res.json();

            if (data.redis) {
                statsDot.className = "stats-dot ok";
                statsLabel.textContent = `Redis OK · ${data.uptime_seconds}s uptime`;
            } else {
                statsDot.className = "stats-dot miss";
                statsLabel.textContent = "Redis degraded";
            }
        } catch {
            statsDot.className = "stats-dot";
            statsLabel.textContent = "API offline";
        }
    }

    function startHealthPoll() {
        updateStats();
        setInterval(updateStats, HEALTH_INTERVAL);
    }

    // Click stats widget → open /stats/cache in new tab
    statsWidget.addEventListener("click", () => {
        window.open(`${API}/docs`, "_blank");
    });

    // ════════════════════════════════════════
    // BACKGROUND SLIDESHOW (Netflix-style)
    // ════════════════════════════════════════
    const BACKDROPS = [
        "https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg", // Interstellar
        "https://image.tmdb.org/t/p/original/dqK9Hag1054tghRQSqLSfrkvQnA.jpg", // Dark Knight
        "https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg", // Inception
        "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg", // Avengers End Game
        "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg", // Spider-Verse
        "https://image.tmdb.org/t/p/original/xJHokMbljvjEVAeUCN11ebL43iJ.jpg"  // Stranger Things
    ];

    let currentSlide = 0;
    const loginBg = document.getElementById("loginBgBlur");
    const heroBg = document.getElementById("heroBanner");

    function rotateBackground() {
        // Preload next image to ensure smooth transition
        const nextSlideIdx = (currentSlide + 1) % BACKDROPS.length;
        const imgPreload = new Image();
        imgPreload.src = BACKDROPS[nextSlideIdx];

        const url = BACKDROPS[currentSlide];

        // Ensure we only update styles if elements exist
        if (loginBg && !loginOverlay.classList.contains("hidden")) {
            loginBg.style.backgroundImage = `url('${url}')`;
            loginBg.style.backgroundSize = "cover";
            loginBg.style.backgroundPosition = "center";
        }
        
        if (heroBg) {
            heroBg.style.backgroundImage = `linear-gradient(to right, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.4) 100%), url('${url}')`;
            heroBg.style.backgroundSize = "cover";
            heroBg.style.backgroundPosition = "top 20% center";
        }

        currentSlide = nextSlideIdx;
    }

    // Start slideshow initially and set interval
    rotateBackground();
    setInterval(rotateBackground, 6000); // Change image every 6 seconds

});
