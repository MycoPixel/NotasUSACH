# Gestión de Notas

Aplicación web (React + TypeScript, Vite) para profesores universitarios. Sube
la nómina de un curso, define las evaluaciones y genera una planilla Excel
moderna (.xlsx) con todas las columnas de notas ya armadas.

Todo se procesa en el navegador: el archivo nunca se sube a ningún servidor.

## Qué hace

1. **Sube la nómina** (`.xls` o `.xlsx`, tal como la entrega la universidad).
   Puedes arrastrar el archivo directamente sobre el recuadro o hacer clic
   para elegirlo. La app detecta automáticamente el curso, el/los
   profesor(es), el semestre y la lista de estudiantes (busca la columna
   "R.U.N" para reconocer la tabla). Antes de continuar puedes desmarcar
   columnas que no necesites (por ejemplo "Ingreso", "Carrera" o "Correo
   Electrónico") para que no aparezcan en la planilla final.
2. **Define las evaluaciones**: agrega cuántas evaluaciones tiene el curso,
   el nombre y el porcentaje de cada una (deben sumar 100%; acepta coma o
   punto como separador decimal). Puedes usar el botón "Repartir 100% en
   partes iguales" para dividir el 100% entre todas las evaluaciones
   agregadas — todas quedan con exactamente el mismo peso (ej: 3
   evaluaciones -> 33,33% cada una) y, si los pesos quedan todos iguales, la
   planilla usa un simple `AVERAGE()` en vez de una suma ponderada, así se
   ve más limpio y es matemáticamente exacto. Si una evaluación se divide en
   varias notas (por ejemplo "Controles" con 5 controles), actívalo e indica
   cuántas — la planilla creará una columna por cada una más una columna de
   promedio.

   En la misma pantalla puedes definir la **nota mínima para aprobar** (por
   defecto 4,0) y, si tu curso lo necesita, un **Examen** o un **PAR/POR**:
   - **Examen**: las evaluaciones de arriba forman el "Promedio de
     Presentación"; defines sólo el % del examen (ej: 40%) y la
     Presentación se queda con el resto (60%). Puedes agregar una nota de
     **eximición** (si la Presentación llega a ese valor, no hace falta
     rendir el examen — la nota final es la Presentación tal cual, aunque
     igual se ingrese una nota de examen) y/o una nota de **obligatoriedad**
     (bajo ese valor es obligación rendir el examen; sin esta regla, el
     examen es obligatorio para todos por defecto).
   - **PAR/POR**: eliges qué evaluaciones sin subdivisiones puede reemplazar
     (nunca una con subdivisiones, como Controles). Cuando se rinde,
     siempre reemplaza la nota más baja entre las elegidas — aunque el
     PAR/POR resulte peor. Admite las mismas reglas opcionales de
     eximición/obligatoriedad, calculadas sobre la Presentación original
     (sin el reemplazo).
3. **Genera y descarga el Excel**. Antes de descargar puedes elegir el color
   que destaca el encabezado de la planilla (5 opciones). La planilla final
   trae:
   - Todas las columnas originales de la nómina.
   - Una columna por cada evaluación (o por cada subdivisión + su promedio),
     vacía y lista para llenar directamente en Excel.
   - Validación de rango: cada nota debe estar entre 1,0 y 7,0 (escala
     chilena).
   - **Promedio de Presentación** (sólo si el curso tiene Examen o PAR/POR):
     el promedio de las evaluaciones de arriba, antes de aplicar el examen o
     el reemplazo del PAR/POR.
   - **Promedio Final**: pondera cada evaluación según su porcentaje (o
     combina Presentación + Examen/PAR-POR, con las reglas de eximición y
     obligatoriedad que hayas definido), y se completa solo apenas
     corresponde.
   - **Estado**: "Aprobado" o "Reprobado", según la nota mínima que hayas
     definido. Como la escala chilena redondea a la décima, un promedio real
     0,05 por debajo de esa nota ya redondea hacia arriba y aprueba — por
     eso la fórmula usa ese umbral sobre el promedio sin redondear (ver
     [escaladenotas.cl](https://escaladenotas.cl/)), no sobre la nota ya
     redondeada.

Las notas se ingresan directamente en Excel después de descargar el archivo
(la app arma la estructura, no es un formulario de ingreso de notas).

## Requisitos

- [Node.js](https://nodejs.org/) 20.19+ o 22.12+ (lo exige Vite 8; probado con Node 22).

## Sobre la dependencia `xlsx`

SheetJS (la librería `xlsx`, usada para leer la nómina) dejó de publicar
versiones nuevas en el registro de npm hace años — lo que aparece ahí
(0.18.5) tiene dos vulnerabilidades conocidas (prototype pollution y ReDoS)
sin parche en ese registro. Las versiones corregidas sólo se publican en el
CDN oficial de SheetJS, así que `package.json` apunta directamente a
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` en vez de a un número
de versión normal — es la forma de instalación que la propia documentación
de SheetJS recomienda (<https://docs.sheetjs.com/docs/getting-started/installation/nodejs/>).
No es un error, es intencional.

**Si usas npm 12 o más nuevo**, por defecto bloquea instalar paquetes desde
una URL así (`EALLOWREMOTE: Fetching packages of type "remote" have been
disabled`). El archivo `.npmrc` del proyecto ya trae `allow-remote=root`,
que permite esto sólo para dependencias declaradas directamente en
`package.json` (como esta) — no hace falta ninguna otra configuración. Si
aun así `npm install` falla en esa línea (por ejemplo, porque tu red
bloquea `cdn.sheetjs.com`), puedes volver a `"xlsx": "^0.18.5"` en
`package.json` (quedan las dos vulnerabilidades, pero de bajo riesgo real
aquí: la app sólo procesa archivos que tú mismo subes, nunca de terceros).

## Uso en desarrollo

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (normalmente `http://localhost:5173`).

## Generar una versión para usar sin terminal

```bash
npm run build
npm run preview
```

`npm run build` deja los archivos listos en `dist/`. Como son solo archivos
estáticos, puedes subir esa carpeta a GitHub Pages, Netlify, Vercel o
cualquier hosting estático y usar la app desde un link, sin depender de tu
computador. (Abrir `dist/index.html` con doble clic no funciona en todos los
navegadores por restricciones de seguridad con módulos ES — usa `npm run
preview` o un hosting real.)

## Estructura del proyecto

```
src/
  types.ts                 Tipos compartidos (Evaluation, ParsedRoster, etc.)
  lib/
    parseRoster.ts          Lee el .xls/.xlsx subido y extrae curso + estudiantes
    buildWorkbook.ts         Arma el Excel final (fórmulas, validación, estilos)
    numberFormat.ts          Parseo de números con coma o punto decimal
    excelColumns.ts          Índice de columna → letra de Excel (A, B, ..., AA)
  components/
    StepIndicator.tsx
    UploadStep.tsx
    EvaluationRow.tsx
    EvaluationsStep.tsx
    ExportStep.tsx
  App.tsx
```

## Adaptar a otro formato de nómina

`parseRoster.ts` busca una fila con una columna "R.U.N" (o "RUT") para
reconocer dónde empieza la tabla de estudiantes, y etiquetas "CURSO",
"PROFESOR" y "SEM/AÑO" para los datos del curso. Si tu universidad exporta
las nóminas con otro formato, ese es el archivo a ajustar — el resto de la
aplicación no depende de la estructura exacta de columnas.

## Posibles mejoras futuras

- Nombres personalizados para cada subdivisión (hoy se numeran
  automáticamente: "Control 1", "Control 2", ...).
- Reordenar evaluaciones arrastrando.
- Guardar configuraciones de evaluaciones para reutilizar entre secciones de
  un mismo curso.
