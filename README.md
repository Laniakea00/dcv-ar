# Долина ЦОД · 50 МВт — web AR

**Open: https://laniakea00.github.io/dcv-ar/**

A static page: the phone camera finds the printed AR mat (`print/board_A4.pdf` or `board_A3.pdf`, print at 100 %) and
the COD_AR_Hologram scene of the Unity app stands on it as a hologram, with the layers of the app (Макет, Серверы,
Энергия, Охлаждение, Сеть, Защита, Все системы), tap-to-inspect and a tour. Without the mat it is a plain 3D viewer.

This repo is only the published copy. The source (tracker, tests, tools, the Unity export menu) lives in the private
`qtwin-io/cod-ar-viewer`, folder `web/`. three.js r179 (MIT) in `vendor/three/`. `model/dcv_web.glb` is the previous
(DCV v5) model and is no longer loaded.
