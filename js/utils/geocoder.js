// geocoder.js — Photon-Geocoder im Stil von vizsim/hilo_profiler
// (Such-Icon, Clear-Button, Loading-Spinner, Tastatur-Navigation, primary/secondary).
// bbox auf Deutschland beschränkt (Unfallkarte-Kontext).
export function setupPhotonGeocoder(map) {
  const container = document.createElement('div');
  container.className = 'geocoder';
  container.innerHTML = `
    <div class="geocoder-input-wrapper">
      <svg class="geocoder-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input type="text" id="search" placeholder="Adresse suchen..." autocomplete="off" />
      <button class="geocoder-clear" id="geocoder-clear" style="display: none;" title="Löschen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="geocoder-loading" id="geocoder-loading" style="display: none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
      </div>
    </div>
    <div id="results" class="geocoder-results"></div>
  `;

  document.body.appendChild(container);

  const input = container.querySelector('#search');
  const resultsElement = container.querySelector('#results');
  const clearButton = container.querySelector('#geocoder-clear');
  const loadingElement = container.querySelector('#geocoder-loading');
  let marker = null;
  let debounceTimer = null;
  let selectedIndex = -1;
  let currentResults = [];

  async function fetchSuggestions(query) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=de&limit=8&bbox=5,47,15,55`;
    const response = await fetch(url);
    const payload = await response.json();
    return payload.features || [];
  }

  function formatResult(feature) {
    const props = feature.properties || {};
    let primary = props.name || props.street || 'Unbekannter Ort';

    if (props.street && props.housenumber) {
      primary = `${props.street} ${props.housenumber}`;
    }

    const secondary = [props.city, props.state, props.country].filter(Boolean).join(', ');
    return { primary, secondary };
  }

  function updateClearButton() {
    clearButton.style.display = input.value ? 'flex' : 'none';
  }

  function updateSelection() {
    const items = resultsElement.querySelectorAll('.geocoder-result-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  }

  function clearResults() {
    resultsElement.style.display = 'none';
    resultsElement.innerHTML = '';
    currentResults = [];
    selectedIndex = -1;
  }

  function selectResult(feature) {
    const [lng, lat] = feature.geometry.coordinates;
    if (marker) {
      marker.remove();
    }

    marker = new maplibregl.Marker({ color: '#2563eb' }).setLngLat([lng, lat]).addTo(map);
    map.flyTo({ center: [lng, lat], zoom: 14, essential: true });

    const formatted = formatResult(feature);
    input.value = formatted.secondary ? `${formatted.primary}, ${formatted.secondary}` : formatted.primary;
    updateClearButton();
    clearResults();
  }

  function showResults(features) {
    resultsElement.innerHTML = '';
    currentResults = features;
    selectedIndex = -1;

    if (!features.length) {
      resultsElement.innerHTML = '<div class="geocoder-no-results">Keine Ergebnisse gefunden</div>';
      resultsElement.style.display = 'block';
      return;
    }

    features.forEach((feature, index) => {
      const item = document.createElement('div');
      const formatted = formatResult(feature);
      item.className = 'geocoder-result-item';
      item.innerHTML = `
        <div class="geocoder-result-primary">${formatted.primary}</div>
        ${formatted.secondary ? `<div class="geocoder-result-secondary">${formatted.secondary}</div>` : ''}
      `;
      item.addEventListener('click', () => selectResult(feature));
      item.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });
      resultsElement.appendChild(item);
    });

    resultsElement.style.display = 'block';
  }

  input.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    updateClearButton();
    clearTimeout(debounceTimer);

    if (query.length < 2) {
      loadingElement.style.display = 'none';
      clearResults();
      return;
    }

    loadingElement.style.display = 'flex';
    debounceTimer = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(query);
        showResults(results);
      } catch (error) {
        showResults([]);
      } finally {
        loadingElement.style.display = 'none';
      }
    }, 250);
  });

  input.addEventListener('keydown', async (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (currentResults.length) {
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateSelection();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (currentResults.length) {
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection();
      }
      return;
    }

    if (event.key === 'Escape') {
      clearResults();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && currentResults[selectedIndex]) {
        selectResult(currentResults[selectedIndex]);
        return;
      }

      if (currentResults[0]) {
        selectResult(currentResults[0]);
      }
    }
  });

  clearButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    input.value = '';
    updateClearButton();
    clearResults();
    if (marker) {
      marker.remove();
      marker = null;
    }
    input.focus();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) {
      clearResults();
    }
  });
}
