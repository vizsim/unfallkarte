// geocoder.js
export function setupPhotonGeocoder(map) {
  const container = document.createElement("div");
  container.className = "geocoder";
  container.innerHTML = `
    <input type="text" id="search" placeholder="Adresse suchen..." autocomplete="off" />
    <div id="results"></div>
  `;
  document.body.appendChild(container);

  const input = container.querySelector("#search");
  const resultsEl = container.querySelector("#results");
  let marker;
  let debounceTimeout;

  async function fetchSuggestions(query) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=de&limit=5&bbox=5,47,15,55`;
    const res = await fetch(url);
    const json = await res.json();
    return json.features || [];
  }

  function showResults(features) {
    resultsEl.innerHTML = "";
    if (features.length === 0) {
      resultsEl.style.display = "none";
      return;
    }

    features.forEach(f => {
      const item = document.createElement("div");
      item.className = "result-item";
      item.textContent = f.properties.name + ", " + (f.properties.city || f.properties.country || "");
      item.addEventListener("click", () => {
        const [lng, lat] = f.geometry.coordinates;
        if (marker) marker.remove();
        marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
        map.flyTo({ center: [lng, lat], zoom: 15 });
        resultsEl.style.display = "none";
        input.value = item.textContent;
      });
      resultsEl.appendChild(item);
    });

    resultsEl.style.display = "block";
  }

  input.addEventListener("input", (e) => {
    const query = e.target.value;
    clearTimeout(debounceTimeout);
    if (query.length < 2) {
      resultsEl.style.display = "none";
      return;
    }

    debounceTimeout = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      showResults(results);
    }, 250);
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const results = await fetchSuggestions(e.target.value);
      if (results.length > 0) {
        const f = results[0];
        const [lng, lat] = f.geometry.coordinates;
        if (marker) marker.remove();
        marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
        map.flyTo({ center: [lng, lat], zoom: 15 });
        resultsEl.style.display = "none";
      }
    }
  });
}
