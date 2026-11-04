/* Bản đồ Leaflet của làng nghề. Chỉ khởi tạo khi khung cảnh 01 đã phóng xong.
   Con lăn chuột phải cuộn trang, không được zoom bản đồ. */

(function () {
  'use strict';

  var map = null;

  window.refreshOriginMap = function () {
    if (!map) { return; }
    map.invalidateSize({ pan: false });
  };

  window.initOriginMap = function () {
    if (map) { return; }
    var element = document.getElementById('origin-leaflet-map');
    if (!element || !window.L) { return; }

    var center = [11.0309829, 106.565394];
    var mapBounds = L.latLngBounds([11.018, 106.552], [11.044, 106.579]);

    map = L.map(element, {
      center: center,
      zoom: 16,
      minZoom: 15,
      maxZoom: 17,
      maxBounds: mapBounds,
      maxBoundsViscosity: 1,
      bounceAtZoomLimits: false,
      zoomControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      keyboard: true,
      worldCopyJump: false
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 15,
      maxZoom: 17,
      noWrap: true,
      keepBuffer: 3,
      attribution: 'Imagery &copy; <a href="https://www.esri.com/en-us/legal/terms/web-site-service">Esri</a>, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community.'
    }).addTo(map);

    L.circle(center, {
      radius: 240,
      color: '#168449',
      weight: 2,
      fillColor: '#55ad73',
      fillOpacity: 0.1,
      interactive: false,
      className: 'map-focus-boundary'
    }).addTo(map);

    L.marker(center, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'map-pulse-icon',
        html: '<span class="map-pulse-ring"><i></i></span>',
        iconSize: [126, 126],
        iconAnchor: [63, 63]
      })
    }).addTo(map);

    L.circleMarker(center, {
      radius: 6,
      color: '#ffffff',
      weight: 3,
      fillColor: '#138249',
      fillOpacity: 1,
      interactive: false
    }).addTo(map);

    map.setMaxBounds(mapBounds);

    var sync = function () { map.invalidateSize({ pan: false }); };
    map.whenReady(sync);
    window.requestAnimationFrame(sync);
    window.setTimeout(sync, 300);
    window.setTimeout(sync, 900);

    window.addEventListener('resize', sync);
  };
}());
