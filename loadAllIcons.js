export async function loadAllIcons(map) {
  const icons = [
    { name: "home", url: "/icons/png/home.png" },
    { name: "playground", url: "/icons/png/playground.png" }
  ];

  for (const icon of icons) {
    if (!map.hasImage(icon.name)) {
      const image = await loadImagePromise(map, icon.url);
      map.addImage(icon.name, image);
    }
  }
}

function loadImagePromise(map, url) {
  return new Promise((resolve, reject) => {
    map.loadImage(url, (error, image) => {
      if (error) return reject(error);
      resolve(image);
    });
  });
}
