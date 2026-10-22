# Credits и лицензии

## 3D-модель зуба
`public/models/tooth-hi.glb`, `public/models/tooth-lo.glb`

Модель создана с нуля для этого проекта скриптом [`scripts/gen-tooth.mjs`](scripts/gen-tooth.mjs): моляр (5 бугров, фиссуры, два изогнутых корня), пульпа с каналами, циркониевая коронка и титановый имплант описаны полями расстояний (SDF), сетка построена алгоритмом Surface Nets, сжатие Draco через glTF Transform.
Сторонних моделей нет. Лицензия: **CC0 1.0** (общественное достояние).

## Шрифты (Google Fonts, self-hosted через Fontsource)
- **Cormorant Garamond**, Christian Thalmann (Catharsis Fonts). SIL Open Font License 1.1. https://fonts.google.com/specimen/Cormorant+Garamond
- **Manrope**, Mikhail Sharanda. SIL Open Font License 1.1. https://fonts.google.com/specimen/Manrope

## Освещение
HDRI не используется: окружение генерируется программно (`RoomEnvironment` из Three.js, MIT) плюс направленный, контровой и заполняющий свет.

## Библиотеки
- [Three.js](https://threejs.org), MIT. Включая `GLTFLoader`, `DRACOLoader` и декодер Draco (Apache 2.0, Google).
- [GSAP 3](https://gsap.com) + ScrollTrigger + SplitText. Стандартная лицензия GSAP (бесплатна, включая коммерческое использование).
- [Lenis](https://lenis.darkroom.engineering), MIT.
- [Vite](https://vite.dev), MIT. [TypeScript](https://www.typescriptlang.org), Apache 2.0.
- Инструменты сборки ассетов: [glTF Transform](https://gltf-transform.dev) (MIT), draco3dgltf (Apache 2.0), puppeteer-core (Apache 2.0), ffmpeg-static (GPL, только для записи промо-видео, в сайт не входит).

## Фото и тексты
Стоковых фото нет. Портреты врачей: CSS-градиенты с инициалами. Имена врачей, отзыв, адрес и телефон вымышлены. Все тексты написаны для проекта.
