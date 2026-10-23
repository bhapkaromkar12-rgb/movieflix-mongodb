const grid = document.getElementById("movieGrid");
const searchInput = document.getElementById("searchInput");
const genreFilters = document.getElementById("genreFilters");
const sortSelect = document.getElementById("sortSelect");
const resultCount = document.getElementById("resultCount");
const emptyState = document.getElementById("emptyState");
const dbStatus = document.getElementById("dbStatus");
const toast = document.getElementById("toast");
let activeGenre = "All";
let movies = [];
let searchTimer;
const accountState = { owned: new Set(), wishlist: new Set() };
function authToken() { return localStorage.getItem("nextmovie_token") || ""; }
function authHeaders(extra = {}) { return { ...extra, Authorization: `Bearer ${authToken()}` }; }
function formatPrice(cents, currency = "usd") {
  try {
    const code = String(currency).toUpperCase();
    const digits = new Intl.NumberFormat(undefined, { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(Number(cents || 0) / (10 ** digits));
  } catch { return `${Number(cents || 0)} ${String(currency).toUpperCase()}`; }
}
async function syncAccountState() {
  const link = document.getElementById("accountLink");
  if (!authToken()) { if (link) link.textContent = "Login / Register"; return; }
  try {
    const me = await fetch("/api/auth/me", { headers: authHeaders() });
    if (!me.ok) throw new Error("Session expired");
    const data = await me.json();
    if (link) { link.textContent = `My Library · ${data.user.name}`; link.href = "/account.html"; }
    const [libraryResponse, wishlistResponse] = await Promise.all([
      fetch("/api/account/library", { headers: authHeaders() }),
      fetch("/api/account/wishlist", { headers: authHeaders() })
    ]);
    if (libraryResponse.ok) accountState.owned = new Set((await libraryResponse.json()).map(item => String(item.movie._id)));
    if (wishlistResponse.ok) accountState.wishlist = new Set((await wishlistResponse.json()).map(movie => String(movie._id)));
  } catch {
    localStorage.removeItem("nextmovie_token");
    localStorage.removeItem("nextmovie_user");
    if (link) { link.textContent = "Login / Register"; link.href = "/auth.html"; }
  }
}
async function buyMovie(movieId) {
  if (!authToken()) { location.href = `/auth.html?next=${encodeURIComponent("/#movies")}`; return; }
  try {
    const response = await fetch("/api/payments/checkout", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ movieId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start checkout.");
    if (!data.checkoutUrl) throw new Error("Payment provider did not return a checkout link.");
    location.assign(data.checkoutUrl);
  } catch (error) { showToast(error.message); }
}
async function downloadMovie(movieId) {
  if (!authToken()) { location.href = `/auth.html?next=${encodeURIComponent("/account.html")}`; return; }
  try {
    const response = await fetch(`/api/movies/${encodeURIComponent(movieId)}/download`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Download unavailable.");
    location.assign(data.downloadUrl);
  } catch (error) { showToast(error.message); }
}
async function toggleWishlist(movieId) {
  if (!authToken()) { location.href = `/auth.html?next=${encodeURIComponent("/#movies")}`; return; }
  const saved = accountState.wishlist.has(String(movieId));
  try {
    const response = await fetch(`/api/account/wishlist/${encodeURIComponent(movieId)}`, {
      method: saved ? "DELETE" : "POST", headers: authHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update watchlist.");
    if (saved) accountState.wishlist.delete(String(movieId)); else accountState.wishlist.add(String(movieId));
    openMovieDetails(window.currentDetailMovie);
    showToast(saved ? "Removed from your watchlist." : "Saved to your watchlist.");
  } catch (error) { showToast(error.message); }
}

async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    dbStatus.textContent = data.database === "connected" ? "MongoDB connected" : "Preview mode";
    document.querySelector(".status-dot").style.background = data.database === "connected" ? "#c4f56a" : "#eabf62";
  } catch { dbStatus.textContent = "Offline"; }
}
function safeText(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function movieCard(movie, index) {
  const fallback = "https://placehold.co/500x750/171b24/c4f56a?text=Movie";
  const poster = movie.poster || fallback;
  return `<article class="movie-card" tabindex="0" role="button" aria-label="View details for ${safeText(movie.title)}" data-movie-detail="${index}" style="animation-delay:${Math.min(index*35,280)}ms">
    <div class="poster-frame">
      <img src="${safeText(poster)}" alt="${safeText(movie.title)} poster" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
      <div class="card-topline"><span class="rating-badge">★ ${Number(movie.rating || 0).toFixed(1)}</span><span class="year-badge">${safeText(movie.year || "—")}</span></div>
      <button class="quick-rate" data-rate="${safeText(movie._id)}" data-title="${safeText(movie.title)}">☆ Rate movie</button>
    </div>
    <div class="movie-meta"><div class="movie-title-line"><h3 class="movie-title" title="${safeText(movie.title)}">${safeText(movie.title)}</h3><span class="movie-year">${safeText(movie.language || "")}</span></div>
    <div class="movie-subtitle"><span>${safeText(movie.genre || "Movie")}</span><i class="genre-dot"></i><span>${Number(movie.rating || 0) >= 4.5 ? "Must watch" : "Worth a watch"}</span></div>
    <p class="movie-description">${safeText(movie.description || "A story waiting to be discovered.")}</p></div>
  </article>`;
}

function getMovieValue(movie, keys, fallback = "Not available") {
  for (const key of keys) {
    const value = movie?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}
function openMovieDetails(movie) {
  if (!movie) return;
  let modal = document.getElementById("movieDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "movieDetailModal";
    modal.className = "movie-detail-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Movie details");
    modal.innerHTML = `<div class="movie-detail-backdrop" data-detail-close></div>
      <section class="movie-detail-panel">
        <button class="detail-close" type="button" aria-label="Close movie details" data-detail-close>✕</button>
        <div class="detail-hero" id="detailHero"></div>
        <div class="detail-body" id="detailBody"></div>
        <div class="detail-navigation"><button type="button" class="detail-prev">← Previous Movie</button><button type="button" class="detail-next">Next Movie →</button></div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => {
      if (e.target.closest("[data-detail-close]")) closeMovieDetails();
      if (e.target.closest(".detail-prev")) navigateDetail(-1);
      if (e.target.closest(".detail-next")) navigateDetail(1);
      const buyButton = e.target.closest("[data-buy-movie]");
      if (buyButton) buyMovie(buyButton.dataset.buyMovie);
      const downloadButton = e.target.closest("[data-download-movie]");
      if (downloadButton) downloadMovie(downloadButton.dataset.downloadMovie);
      const wishlistButton = e.target.closest("[data-wishlist-movie]");
      if (wishlistButton) toggleWishlist(wishlistButton.dataset.wishlistMovie);
      const playButton = e.target.closest("[data-play-trailer]");
      if (playButton) playMovieTrailer(playButton.dataset.playTrailer, window.currentDetailMovie);
      if (e.target.closest("[data-trailer-close]")) closeTrailerPlayer();
    });
  }
  window.currentDetailMovie = movie;
  window.currentDetailIndex = movies.findIndex(m => String(m._id) === String(movie._id));
  const poster = getMovieValue(movie, ["poster", "posterUrl", "image"], "");
  const title = getMovieValue(movie, ["title", "name"], "Untitled movie");
  const year = getMovieValue(movie, ["year", "releaseYear"], "Year unknown");
  const rating = Number(getMovieValue(movie, ["rating", "imdbRating"], 0));
  const genre = getMovieValue(movie, ["genre", "genres"], "Genre not listed");
  const description = getMovieValue(movie, ["description", "plot", "overview"], "No description has been added for this movie yet.");
  const director = getMovieValue(movie, ["director"], "Not listed");
  const cast = getMovieValue(movie, ["cast", "actors"], "Not listed");
  const duration = getMovieValue(movie, ["duration", "runtime", "length"], "Not listed");
  const language = getMovieValue(movie, ["language"], "Not listed");
  const trailer = getMovieValue(movie, ["trailerUrl", "trailer", "youtubeUrl", "videoUrl"], "");
  const hero = document.getElementById("detailHero");
  hero.style.backgroundImage = poster && poster !== "Not available" ? `linear-gradient(90deg,#0b0d12 0%,rgba(11,13,18,.88) 42%,rgba(11,13,18,.28) 100%),url("${String(poster).replace(/["\\]/g, "")}")` : "linear-gradient(120deg,#1b2118,#10131a)";
  hero.innerHTML = `<div class="detail-poster">${poster && poster !== "Not available" ? `<img src="${safeText(poster)}" alt="${safeText(title)} poster" onerror="this.style.display='none'">` : '<div class="detail-poster-placeholder">🎬</div>'}</div>
    <div class="detail-heading"><span class="detail-eyebrow">MOVIE DETAILS</span><h1>${safeText(title)}</h1><div class="detail-meta">${safeText(year)} <span>•</span> ${safeText(duration)} <span>•</span> ${safeText(language)}</div>
    <div class="detail-rating">★ <strong>${rating > 0 ? rating.toFixed(1) : "—"}</strong><span>/ 5 rating</span></div>
    <button class="detail-play" type="button" data-play-trailer="${safeText(trailer && trailer !== "Not available" ? trailer : "")}">▶ Play Trailer</button>
    <div class="detail-purchase-actions">${movie.downloadAvailable ? (accountState.owned.has(String(movie._id)) ? `<button class="purchase-btn" type="button" data-download-movie="${safeText(movie._id)}">⬇ Download from library</button>` : `<button class="purchase-btn" type="button" data-buy-movie="${safeText(movie._id)}">Buy download · ${safeText(formatPrice(movie.downloadPriceCents, movie.downloadCurrency))}</button>`) : ""}<button class="watchlist-btn" type="button" data-wishlist-movie="${safeText(movie._id)}">${accountState.wishlist.has(String(movie._id)) ? "♥ Saved" : "♡ Watchlist"}</button></div><small class="license-note">${movie.downloadAvailable ? "Secure download for licensed media. Payment confirmation is required." : "No digital download is available for this title."}</small></div>`;
  document.getElementById("detailBody").innerHTML = `<h2>Synopsis</h2><p class="detail-description">${safeText(description)}</p>
    <div class="detail-info-grid"><div><span>GENRE</span><strong>${safeText(Array.isArray(genre) ? genre.join(", ") : genre)}</strong></div>
    <div><span>DIRECTOR</span><strong>${safeText(director)}</strong></div>
    <div><span>CAST</span><strong>${safeText(Array.isArray(cast) ? cast.join(", ") : cast)}</strong></div>
    <div><span>LANGUAGE</span><strong>${safeText(language)}</strong></div></div>`;
  modal.classList.add("open");
  document.body.classList.add("detail-open");
  modal.querySelector(".detail-close").focus();
}
function getTrailerEmbedUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl, window.location.origin);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` : "";
    }
    if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
      let id = url.searchParams.get("v");
      if (!id && ["embed", "shorts", "live"].includes(url.pathname.split("/").filter(Boolean)[0])) id = url.pathname.split("/").filter(Boolean)[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` : rawUrl;
    }
    if (url.pathname.toLowerCase().endsWith(".mp4") || url.pathname.toLowerCase().endsWith(".webm") || url.pathname.toLowerCase().endsWith(".ogg")) return url.href;
    return rawUrl;
  } catch { return ""; }
}
function closeTrailerPlayer() {
  const player = document.getElementById("trailerPlayerOverlay");
  if (player) { const video = player.querySelector("video, iframe"); if (video) video.src = ""; player.remove(); }
}
function playMovieTrailer(rawUrl, movie) {
  closeTrailerPlayer();
  const title = getMovieValue(movie, ["title", "name"], "Movie");
  if (!rawUrl) {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " official trailer")}`;
    window.open(searchUrl, "_blank", "noopener,noreferrer");
    showToast("No trailer URL saved. Opening YouTube trailer search.");
    return;
  }
  const playerUrl = getTrailerEmbedUrl(rawUrl);
  if (!playerUrl) { showToast("This trailer URL is not valid. Add a YouTube or direct video URL."); return; }
  const overlay = document.createElement("div");
  overlay.id = "trailerPlayerOverlay";
  overlay.className = "trailer-player-overlay";
  overlay.innerHTML = `<div class="trailer-player-backdrop" data-trailer-close></div><section class="trailer-player-box" role="dialog" aria-modal="true" aria-label="${safeText(title)} trailer"><div class="trailer-player-header"><strong>▶ ${safeText(title)} — Trailer</strong><button type="button" aria-label="Close trailer" data-trailer-close>✕</button></div><div class="trailer-video-stage" id="trailerVideoStage"></div></section>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector("#trailerVideoStage");
  const lower = playerUrl.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".ogg")) {
    const video = document.createElement("video"); video.controls = true; video.autoplay = true; video.playsInline = true; video.src = playerUrl; stage.appendChild(video);
    video.play().catch(() => {});
  } else {
    const iframe = document.createElement("iframe"); iframe.src = playerUrl; iframe.title = `${title} trailer`; iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; iframe.allowFullscreen = true; stage.appendChild(iframe);
  }
}

function closeMovieDetails() {
  const modal = document.getElementById("movieDetailModal");
  if (modal) modal.classList.remove("open");
  document.body.classList.remove("detail-open");
}
function navigateDetail(direction) {
  if (!movies.length) return;
  let next = (window.currentDetailIndex + direction + movies.length) % movies.length;
  openMovieDetails(movies[next]);
}

async function loadMovies() {
  const params = new URLSearchParams({ search: searchInput.value.trim(), genre: activeGenre, sort: sortSelect.value });
  try {
    const response = await fetch(`/api/movies?${params}`);
    if (!response.ok) throw new Error("Could not load movies");
    movies = await response.json();
    renderMovies();
  } catch (e) {
    grid.innerHTML = '<div class="loading-card">Could not load movies. Please check that the server is running.</div>';
    resultCount.textContent = "Connection issue";
  }
}
function renderMovies() {
  resultCount.textContent = `${movies.length} ${movies.length === 1 ? "movie" : "movies"} to discover`;
  grid.innerHTML = movies.map(movieCard).join("");
  emptyState.hidden = movies.length > 0;
  grid.hidden = movies.length === 0;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadMovies, 220);
});
genreFilters.addEventListener("click", e => {
  const button = e.target.closest("[data-genre]");
  if (!button) return;
  activeGenre = button.dataset.genre;
  genreFilters.querySelectorAll(".genre-chip").forEach(b => b.classList.toggle("selected", b === button));
  loadMovies();
});
sortSelect.addEventListener("change", loadMovies);
document.getElementById("resetFilters").addEventListener("click", () => {
  searchInput.value = ""; activeGenre = "All"; sortSelect.value = "recommended";
  genreFilters.querySelectorAll(".genre-chip").forEach(b => b.classList.toggle("selected", b.dataset.genre === "All"));
  loadMovies();
});
grid.addEventListener("click", async e => {
  const button = e.target.closest("[data-rate]");
  if (!button) {
    const card = e.target.closest("[data-movie-detail]");
    if (card) openMovieDetails(movies[Number(card.dataset.movieDetail)]);
    return;
  }
  const movieId = button.dataset.rate;
  if (movieId.startsWith("demo")) {
    showToast("Connect MongoDB and add movies to save ratings.");
    return;
  }
  const answer = prompt(`Rate ${button.dataset.title} from 1 to 5:`, "5");
  if (answer === null) return;
  const rating = Number(answer);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return showToast("Please enter a rating from 1 to 5.");
  try {
    const response = await fetch(`/api/movies/${movieId}/rating`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({rating}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Rating could not be saved.");
    showToast("Thanks! Your rating has been saved.");
    loadMovies();
  } catch (err) { showToast(err.message); }
});
grid.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-movie-detail]")) {
    e.preventDefault();
    openMovieDetails(movies[Number(e.target.dataset.movieDetail)]);
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeMovieDetails();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); searchInput.focus();
  }
});
checkHealth();
syncAccountState();
loadMovies();