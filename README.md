# Convertidor personal

Convertidor de archivos local, estilo Convertio, para uso personal. Corre en tu PC: los archivos nunca salen a internet.

## Fase 1 (actual)

- Interfaz web local con arrastrar y soltar, varios archivos a la vez.
- "Convertir todos a" para aplicar el mismo formato a toda la lista.
- Control de calidad para imágenes con pérdida (JPG, WebP, AVIF, TIFF).
- Detección automática de motores instalados; los formatos sin motor quedan desactivados.
- Resultados temporales que se borran solos después de 1 hora.
- Servidor escuchando solo en `127.0.0.1` (no accesible desde la red).

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

El puerto se cambia con la variable `PORT`.

## Estructura

```
src/
  server.js          API (Express) y servidor de archivos estáticos
  formats.js         matriz de formatos: entradas, salidas y motor
  convert.js         elige el conversor según el motor
  converters/        un módulo por motor (sharp, FFmpeg, LibreOffice, Pandoc)
  tools.js           detecta qué motores hay instalados
public/              interfaz web (HTML, CSS y JS sin frameworks)
data/                archivos temporales (ignorado por git)
```

## API

- `GET /api/formats`: categorías, formatos y motores disponibles.
- `POST /api/convert`: multipart con `file`, `target` y opcional `quality` (1-100). Devuelve `{ id, filename, size, ms }`.
- `GET /api/download/:id`: descarga el resultado.

## Hoja de ruta

- **Fase 2:** barra de progreso real (FFmpeg), cola de trabajos persistente, presets de video y audio (resolución, bitrate, recorte).
- **Fase 3:** PDF avanzado (unir, dividir, comprimir, PDF a imagen), OCR con Tesseract, ebooks con Calibre, comprimidos con 7-Zip.
- **Fase 4:** conversiones en cadena, carpeta vigilada para convertir automáticamente, menú contextual en el Explorador de Windows.
