# Convertidor personal

Convertidor de archivos local, estilo Convertio, para uso personal. Corre en tu PC: los archivos nunca salen a internet.

## Funciones

### Fase 1

- Interfaz web local con arrastrar y soltar, varios archivos a la vez.
- "Convertir todos a" para aplicar el mismo formato a toda la lista.
- Control de calidad para imágenes con pérdida (JPG, WebP, AVIF, TIFF).
- Detección automática de motores instalados; los formatos sin motor quedan desactivados.
- Resultados temporales que se borran solos después de 1 hora.
- Servidor escuchando solo en `127.0.0.1` (no accesible desde la red).

### Fase 2

- Cola de trabajos en el servidor: varias conversiones a la vez (`CONCURRENCY`, por defecto 2) y el resto espera su turno.
- La cola se guarda en disco: si cierras el programa, al abrirlo retoma lo pendiente.
- Barra de progreso real para audio y video (FFmpeg) y progreso de subida.
- Cancelar cualquier conversión en curso o en espera.
- Opciones por archivo de audio y video: resolución, calidad, bitrate de audio, mono, quitar audio y recorte (inicio y fin en segundos o `mm:ss`).
- Presets: alta calidad, Full HD, ligero para compartir (720p), mínimo tamaño (480p) y voz/podcast.
- Avisos en vivo del servidor al navegador con Server-Sent Events.

## Formatos

| Tipo | Entrada | Salida | Motor |
|---|---|---|---|
| Imagen | jpg, png, webp, avif, gif, tiff, svg | jpg, png, webp, avif, gif, tiff | sharp (incluido) |
| Audio | mp3, wav, ogg, flac, aac, m4a, opus, wma, aiff | mp3, wav, ogg, flac, aac, m4a, opus | FFmpeg (incluido) |
| Video | mp4, mkv, webm, avi, mov, flv, wmv, m4v, mpeg, 3gp, ts | mp4, mkv, webm, avi, mov, gif, mp3, wav, m4a | FFmpeg (incluido) |
| Documento | doc, docx, odt, rtf, txt | pdf, docx, odt, rtf, txt, html | LibreOffice (opcional) |
| Hoja de cálculo | xls, xlsx, ods, csv | pdf, xlsx, ods, csv, html | LibreOffice (opcional) |
| Presentación | ppt, pptx, odp | pdf, pptx, odp | LibreOffice (opcional) |
| Texto marcado / ebook | md, html, epub, rst, tex | html, md, docx, odt, epub, rst | Pandoc (opcional) |

## Requisitos

- Node.js 20 o superior.
- Opcional, para documentos: [LibreOffice](https://www.libreoffice.org/) y [Pandoc](https://pandoc.org/).

```powershell
winget install TheDocumentFoundation.LibreOffice
winget install JohnMacFarlane.Pandoc
```

## Uso

```powershell
npm install
npm start
```

Abre http://localhost:3210. En Windows también puedes hacer doble clic en `Iniciar.bat`.

El puerto se cambia con la variable `PORT` y las conversiones simultáneas con `CONCURRENCY`.

## Estructura

```
src/
  server.js          API (Express), eventos en vivo y archivos estáticos
  jobs.js            cola de trabajos con concurrencia, cancelación y persistencia
  options.js         validación de opciones de conversión
  presets.js         presets y valores permitidos de audio y video
  formats.js         matriz de formatos: entradas, salidas y motor
  convert.js         elige el conversor según el motor
  converters/        un módulo por motor (sharp, FFmpeg, LibreOffice, Pandoc)
  tools.js           detecta qué motores hay instalados
public/              interfaz web (HTML, CSS y JS sin frameworks)
data/                archivos temporales (ignorado por git)
```

## API

- `GET /api/formats`: categorías, formatos, motores disponibles y presets.
- `GET /api/jobs`: lista de trabajos.
- `POST /api/jobs`: multipart con `file`, `target` y opcional `options` (JSON). Devuelve el trabajo en cola.
- `DELETE /api/jobs/:id`: cancela (si está activo) y borra el trabajo.
- `GET /api/events`: Server-Sent Events con `update` (progreso y estado) y `removed`.
- `GET /api/download/:id`: descarga el resultado.

Opciones de audio y video: `quality` (`high`, `medium`, `low`), `height` (2160, 1440, 1080, 720, 480, 360), `audioBitrate` (64 a 320), `mono`, `noAudio`, `start`, `end`. Imágenes: `imageQuality` (1-100).

## Hoja de ruta

- ~~**Fase 2:** barra de progreso real, cola de trabajos persistente, presets y recorte de audio y video.~~ Hecha.
- **Fase 3:** PDF avanzado (unir, dividir, comprimir, PDF a imagen), OCR con Tesseract, ebooks con Calibre, comprimidos con 7-Zip.
- **Fase 4:** conversiones en cadena, carpeta vigilada para convertir automáticamente, menú contextual en el Explorador de Windows.
