// Guided stories ("Как устроено"): the processes of the Unity app played on their own, step by step, no taps needed.
// Texts and routes follow MaketScenarioCatalog / MaketScenarioVisuals (Unity): Путь энергии, Отказ внешнего ввода,
// Резерв пути питания, Путь тепла, Резерв охлаждения, Резерв связи, От запроса к результату, plus the server anatomy
// (rack -> tray -> GPU/CPU, via inspect.js) and the protection zones. Routes are light tubes between the real units of
// the model: blue = normal / supply, amber = heat or reserve in use, red = isolated (with a visible gap), green = ready.
import * as THREE from 'three';

const C = { blue: new THREE.Color('#62b8ff'), amber: new THREE.Color('#ff9e0a'), red: new THREE.Color('#ff5a4f'), green: new THREE.Color('#30d158') };
const CSS = { blue: '#62b8ff', amber: '#ff9e0a', red: '#ff5a4f', green: '#30d158' };

// ------------------------------------------------------------------ story definitions
// step: { t: title, x: explanation, r: result, d: seconds, open: unit | null (close), level, tray: 'in'|'out',
//         flows: [[from, to, color, 'fault'|'rev']], focus: [[unit, color]], tags: [[unit, text, color]], fx }
const ROOM = 'H03', R = 'AI03-R02-05';
const DR = p => `DRUPS-${p}-03`, RPP = p => `RPP-H3-${p}`;
export const STORIES = {
  server: { name: 'Как устроен сервер', layer: 'compute', steps: [
    { t: 'AI-стойка NVL72', x: 'Одна из 308 AI-стоек центрального корпуса поднимается из зала и поворачивается к вам фронтом.', r: '120 кВт · 72 GPU — расчётный ориентир', open: R, level: 0, d: 6 },
    { t: 'Что внутри стойки', x: 'Боковые панели и задняя дверь отходят, лотки, коммутаторы и блоки питания выдвигаются.', r: '18 вычислительных лотков · 9 NVLink-коммутаторов · 8 блоков питания', open: R, level: 1, d: 7 },
    { t: 'Вычислительный лоток', x: 'Один из 18 лотков выезжает из стойки и выходит на первый план.', r: 'Лоток: 4 GPU + 2 CPU', open: R, level: 0, tray: 'out', d: 6.5 },
    { t: 'GPU, CPU и холодные пластины', x: 'Крышка снята, холодные пластины приподняты над процессорами. Они прилегают прямо к кристаллам.', r: 'Жидкостное охлаждение на каждом процессоре', open: R, tray: 'out', d: 7 },
    { t: 'Жидкость забирает тепло', x: 'Холодный поток (синий) проходит по пластинам и уносит тепло (красный) к коллекторам стойки.', r: 'Дальше тепло уходит в CDU — история «Путь тепла»', open: R, tray: 'out', d: 7 },
    { t: 'Лоток возвращается', x: 'Лоток уходит обратно в слот, стойка опускается в зал.', r: 'Нажмите на любую стойку, чтобы рассмотреть её самостоятельно', open: R, tray: 'in', d: 4.5 },
  ] },
  compute: { name: 'От запроса к результату', layer: 'compute', steps: [
    { t: 'Запрос поступает на площадку', x: 'Световой пакет обозначает задачу, поступившую через сетевой узел.', r: 'Входящий запрос', flows: [['CORE-NET-1', 'NET-H3-A', 'blue']], focus: [['CORE-NET-1', 'blue']], tags: [['CORE-NET-1', 'Входящий запрос', 'blue']], d: 5.5 },
    { t: 'Задача направлена в зал', x: 'Сетевой маршрут доставляет запрос к выбранной группе серверов.', r: 'Сеть → серверный зал 03', flows: [['CORE-NET-1', 'NET-H3-A', 'blue'], ['NET-H3-A', R, 'blue']], focus: [['NET-H3-A', 'blue']], tags: [['NET-H3-A', 'Сетевой шкаф · зал 03', 'blue']], d: 6 },
    { t: 'AI-стойки выполняют вычисления', x: 'Импульсы отмечают обработку внутри стоек зала.', r: 'Обработка задачи · условная модель', flows: [['NET-H3-A', R, 'blue']], focus: ['AI03-R02-01', 'AI03-R02-03', R, 'AI03-R02-07', 'AI03-R01-04', 'AI03-R03-04'].map(u => [u, 'amber']), tags: [[R, 'AI · обработка задачи', 'amber']], d: 6 },
    { t: 'Результат возвращается', x: 'Ответ проходит от серверов к выходному сетевому узлу.', r: 'Результат вычислений', flows: [[R, 'NET-H3-A', 'green'], ['NET-H3-A', 'CORE-NET-1', 'green']], focus: [['CORE-NET-1', 'green']], tags: [['CORE-NET-1', 'Результат', 'green']], d: 6 },
  ] },
  energy: { name: 'Путь энергии', layer: 'power', steps: [
    { t: 'Источник энергии', x: 'Подстанция принимает энергию и передаёт её на площадку.', r: 'Подстанция · 500/35 кВ', focus: [['SUB-TX-01', 'blue'], ['SUB-TX-02', 'blue']], tags: [['SUB-TX-01', 'Подстанция', 'blue']], d: 5.5 },
    { t: 'Четыре пути питания', x: 'Независимые пути A, B, C и D распределены между двумя энергоблоками.', r: '4 пути · A / B / C / D', flows: ['A', 'B', 'C', 'D'].map((p, i) => [`SUB-TX-0${i + 1}`, DR(p), 'blue']), focus: ['A', 'B', 'C', 'D'].map(p => [DR(p), 'blue']), tags: [[DR('A'), 'Путь A'], [DR('C'), 'Путь C']], d: 6.5 },
    { t: 'Защита через DRUPS', x: 'Дизель-роторный ИБП: двигатель, генератор и маховик с запасом кинетической энергии.', r: '24 DRUPS · по 6 на путь', open: DR('A'), level: 1, flows: ['A', 'B', 'C', 'D'].map((p, i) => [`SUB-TX-0${i + 1}`, DR(p), 'blue']), d: 8 },
    { t: 'Энергия для вычислений', x: 'Распределение подаёт питание к стойкам выбранного зала.', r: '6 залов · 608 стоек в расчёте', open: null, flows: ['A', 'B', 'C', 'D'].flatMap(p => [[DR(p), RPP(p), 'blue'], [RPP(p), R, 'blue']]), focus: [[R, 'blue']], tags: [[R, 'Зал 03 · нагрузка'], [RPP('A'), 'Распределение A–D']], d: 7 },
  ] },
  gridloss: { name: 'Отказ внешнего ввода', layer: 'power', steps: [
    { t: 'Штатное питание', x: 'Внешний ввод питает энергоблоки. DRUPS находятся в рабочей цепи.', r: 'Ввод доступен', flows: [['SUB-TX-01', DR('A'), 'blue'], [DR('A'), RPP('A'), 'blue'], [RPP('A'), R, 'blue']], focus: [[DR('A'), 'blue']], tags: [[DR('A'), 'DRUPS · штатный режим', 'blue']], d: 5.5 },
    { t: 'Внешний ввод недоступен', x: 'Поток от подстанции прерывается. Нагрузка остаётся на защищённой стороне.', r: 'Отказ ввода · демонстрация', flows: [['SUB-TX-01', DR('A'), 'red', 'fault'], [DR('A'), RPP('A'), 'amber'], [RPP('A'), R, 'amber']], focus: [[DR('A'), 'red']], tags: [['SUB-TX-01', 'Ввод недоступен', 'red'], [R, 'Защищённая нагрузка', 'amber']], d: 6 },
    { t: 'Маховик поддерживает питание', x: 'Кинетическая энергия маховика перекрывает переходный период внутри DRUPS.', r: 'Переходный источник · маховик', open: DR('A'), level: 1, fx: { rotor: 3, engine: false }, flows: [['SUB-TX-01', DR('A'), 'red', 'fault'], [DR('A'), RPP('A'), 'amber'], [RPP('A'), R, 'amber']], d: 7 },
    { t: 'Дизель принимает нагрузку', x: 'Дизель в составе DRUPS выходит на режим и поддерживает генерацию.', r: 'Резервный источник · дизель', open: DR('A'), level: 1, fx: { rotor: 3, engine: true }, flows: [['SUB-TX-01', DR('A'), 'red', 'fault'], [DR('A'), RPP('A'), 'amber'], [RPP('A'), R, 'amber']], d: 7 },
    { t: 'Сеть восстановлена', x: 'После проверки ввода схема готовится к возврату на внешнее питание.', r: 'Восстановление · условная последовательность', open: null, fx: { rotor: 1, engine: false }, flows: [['SUB-TX-01', DR('A'), 'green'], [DR('A'), RPP('A'), 'amber'], [RPP('A'), R, 'amber']], focus: [['SUB-TX-01', 'green']], d: 5.5 },
    { t: 'Возврат к штатному режиму', x: 'Нагрузка возвращена на ввод. Резерв снова готов к следующему событию.', r: 'Штатный путь восстановлен', flows: [['SUB-TX-01', DR('A'), 'blue'], [DR('A'), RPP('A'), 'blue'], [RPP('A'), R, 'blue']], focus: [[DR('A'), 'green']], tags: [[DR('A'), 'Резерв готов', 'green']], d: 5.5 },
  ] },
  powerpath: { name: 'Резерв пути питания', layer: 'power', steps: [
    { t: 'Четыре доступных пути', x: 'A, B, C и D обеспечивают распределённое питание зала.', r: 'A / B / C / D · схема проекта', flows: ['A', 'B', 'C', 'D'].flatMap((p, i) => [[`SUB-TX-0${i + 1}`, DR(p), 'blue'], [DR(p), RPP(p), 'blue'], [RPP(p), R, 'blue']]), focus: ['A', 'B', 'C', 'D'].map(p => [DR(p), 'blue']), d: 6 },
    { t: 'Путь A изолирован', x: 'Повреждённый путь отделяется от работающей части системы.', r: 'Путь A · недоступен', flows: [['SUB-TX-01', DR('A'), 'red', 'fault'], [DR('A'), RPP('A'), 'red', 'fault'], ...['B', 'C', 'D'].flatMap((p, i) => [[`SUB-TX-0${i + 2}`, DR(p), 'blue'], [DR(p), RPP(p), 'blue']])], focus: [[DR('A'), 'red']], tags: [[DR('A'), 'A · изолирован', 'red']], d: 6 },
    { t: 'Оставшиеся пути принимают питание', x: 'Маршрут к залу проходит по B, C и D.', r: 'B / C / D · принцип резервирования', flows: [['SUB-TX-01', DR('A'), 'red', 'fault'], ...['B', 'C', 'D'].flatMap((p, i) => [[`SUB-TX-0${i + 2}`, DR(p), 'amber'], [DR(p), RPP(p), 'amber'], [RPP(p), R, 'amber']])], focus: [[DR('A'), 'red'], [DR('B'), 'amber'], [R, 'blue']], tags: [[DR('B'), 'B / C / D · резерв', 'amber'], [R, 'Питание зала 03']], d: 7 },
    { t: 'Путь A возвращён', x: 'После устранения причины восстанавливается штатная конфигурация.', r: 'Четыре пути снова доступны', flows: ['A', 'B', 'C', 'D'].flatMap((p, i) => [[`SUB-TX-0${i + 1}`, DR(p), 'blue'], [DR(p), RPP(p), 'blue'], [RPP(p), R, 'blue']]), focus: [[DR('A'), 'green']], d: 5.5 },
  ] },
  heat: { name: 'Путь тепла', layer: 'cooling', steps: [
    { t: 'Тепло возникает в стойке', x: 'AI-вычисления превращают потребляемую энергию в тепло.', r: 'AI-стойка · 120 кВт в расчёте', focus: [[R, 'amber']], tags: [[R, 'AI-стойка · тепло', 'amber']], d: 5.5 },
    { t: 'Жидкость забирает тепло', x: 'Холодный поток приходит к стойке. Нагретая жидкость возвращается к CDU.', r: 'Два направления одного контура', flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', R, 'blue']], focus: [[R, 'amber'], ['CDU-H03-01', 'blue']], tags: [['CDU-H03-01', 'CDU · теплообменник', 'blue']], d: 6 },
    { t: 'CDU разделяет контуры', x: 'Пластинчатый теплообменник передаёт тепло во внешний контур, насосы поддерживают циркуляцию.', r: 'CDU · 520 кВт по концепции', open: 'CDU-H03-01', level: 1, flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', R, 'blue']], d: 7.5 },
    { t: 'Теплоотвод на втором этаже', x: 'Внешний контур доставляет тепло к сухим охладителям: вентиляторы продувают оребрённые секции.', r: 'Сухой охладитель · 1 040 кВт', open: 'DRY-H03-01', level: 1, flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', R, 'blue'], ['CDU-H03-01', 'DRY-H03-01', 'amber']], d: 8 },
    { t: 'Контур замыкается', x: 'Охлаждённая жидкость возвращается. Циркуляция поддерживает работу стойки.', r: 'Охлаждение работает непрерывно', open: null, flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', R, 'blue'], ['CDU-H03-01', 'DRY-H03-01', 'amber'], ['DRY-H03-01', 'CDU-H03-01', 'blue']], focus: [['DRY-H03-01', 'blue']], tags: [['DRY-H03-01', 'Теплоотвод · второй этаж', 'blue']], d: 6.5 },
  ] },
  coolreserve: { name: 'Резерв охлаждения', layer: 'cooling', steps: [
    { t: 'Рабочая группа CDU', x: 'Рабочий CDU выбранного зала и установленный рядом резерв.', r: '10 рабочих + 1 резервный CDU / зал', flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', 'DRY-H03-01', 'amber'], ['DRY-H03-01', 'CDU-H03-01', 'blue'], ['CDU-H03-01', R, 'blue']], focus: [['CDU-H03-01', 'blue'], ['CDU-H03-11', 'green']], tags: [['CDU-H03-01', 'Рабочий CDU'], ['CDU-H03-11', 'Резервный CDU · готов', 'green']], d: 6 },
    { t: 'Рабочий CDU недоступен', x: 'Проблемный узел выделен. Его ветвь выведена из рабочего маршрута.', r: 'CDU · изоляция узла', flows: [[R, 'CDU-H03-01', 'red', 'fault']], focus: [['CDU-H03-01', 'red'], ['CDU-H03-11', 'green']], tags: [['CDU-H03-01', 'Рабочий CDU · отключён', 'red']], d: 5.5 },
    { t: 'Подключение резерва', x: 'Поток направляется к резервному CDU, уже установленному в зале.', r: 'Резервный CDU · включение', flows: [[R, 'CDU-H03-01', 'red', 'fault'], [R, 'CDU-H03-11', 'amber'], ['CDU-H03-11', 'DRY-H03-01', 'amber'], ['DRY-H03-01', 'CDU-H03-11', 'blue'], ['CDU-H03-11', R, 'blue']], focus: [['CDU-H03-01', 'red'], ['CDU-H03-11', 'amber']], tags: [['CDU-H03-11', 'Резервный CDU · работает', 'amber']], d: 7 },
    { t: 'Возврат рабочей схемы', x: 'После обслуживания рабочий CDU возвращён, запасной снова в резерве.', r: 'Рабочая группа восстановлена', flows: [[R, 'CDU-H03-01', 'amber'], ['CDU-H03-01', 'DRY-H03-01', 'amber'], ['DRY-H03-01', 'CDU-H03-01', 'blue'], ['CDU-H03-01', R, 'blue']], focus: [['CDU-H03-01', 'blue'], ['CDU-H03-11', 'green']], d: 5.5 },
  ] },
  network: { name: 'Резерв связи', layer: 'network', steps: [
    { t: 'Сетевой шкаф', x: 'В каждом зале два сетевых шкафа — два независимых направления связи.', r: '14 шкафов · принятая компоновка', open: 'NET-H3-A', level: 1, d: 7 },
    { t: 'Данные идут по маршруту A', x: 'Пакеты проходят от сетевого узла к серверам выбранного зала.', r: 'Маршрут A · активен', open: null, flows: [['NET-H3-A', R, 'blue']], focus: [['NET-H3-A', 'blue'], ['NET-H3-B', 'green']], tags: [['NET-H3-A', 'Маршрут A'], ['NET-H3-B', 'Маршрут B · резерв', 'green']], d: 5.5 },
    { t: 'Маршрут A недоступен', x: 'Новые пакеты больше не идут по повреждённой ветви.', r: 'Маршрут A · отказ', flows: [['NET-H3-A', R, 'red', 'fault']], focus: [['NET-H3-A', 'red'], ['NET-H3-B', 'green']], tags: [['NET-H3-A', 'Маршрут A · недоступен', 'red']], d: 5.5 },
    { t: 'Используется направление B', x: 'Пакеты поступают через второй сетевой шкаф.', r: 'Маршрут B · резервное направление', flows: [['NET-H3-A', R, 'red', 'fault'], ['NET-H3-B', R, 'amber']], focus: [['NET-H3-A', 'red'], ['NET-H3-B', 'amber']], tags: [['NET-H3-B', 'Маршрут B · активен', 'amber']], d: 6 },
    { t: 'Оба направления доступны', x: 'После восстановления снова доступны основной и резервный маршруты.', r: 'Два направления · восстановлены', flows: [['NET-H3-A', R, 'blue'], ['NET-H3-B', R, 'green']], focus: [['NET-H3-A', 'blue'], ['NET-H3-B', 'green']], d: 5 },
  ] },
  safety: { name: 'Защита залов', layer: 'continuity', steps: [
    { t: 'Локальная защита зала', x: 'Узел пожарной защиты: баллоны с огнетушащим составом и распределительный коллектор.', r: 'Контроль одной зоны без остановки соседних', open: 'FIRE-H3', level: 1, d: 7.5 },
    { t: 'Одна зона — один зал', x: 'Каждый серверный зал защищён своим узлом.', r: '6 зон защиты', open: null, focus: [1, 2, 3, 4, 5, 6].map(i => [`FIRE-H${i}`, 'red']), tags: [['FIRE-H1', 'Зона 01', 'red'], ['FIRE-H3', 'Зона 03', 'red'], ['FIRE-H6', 'Зона 06', 'red']], d: 6 },
    { t: 'Операторский центр', x: 'Наблюдение за питанием, охлаждением и вычислениями.', r: 'Управление инженерными системами', open: 'NOC-1', level: 0, d: 6.5 },
    { t: 'Сигналы сходятся к операторам', x: 'Состояние каждой зоны видно в операторском центре. Трассы показаны условно.', r: 'Иллюстрация принципа · состав системы задаёт проект', open: null, flows: [1, 2, 3, 4, 5, 6].map(i => [`FIRE-H${i}`, 'NOC-1', 'green']), focus: [['NOC-1', 'green']], tags: [['NOC-1', 'Операторский центр', 'green']], d: 6.5 },
  ] },
};
STORIES.campus = { name: 'Развитие до 500 МВт', layer: 'campus', steps: [
  { t: 'ЦОД-1 · первая очередь', x: 'Проект сегодня: шесть серверных залов в центральном корпусе и два энергоблока по его длинным сторонам.', r: 'Очередь 1 · 50 МВт', campus: { built: 1, gpp: false, lines: false, plots: false }, d: 6 },
  { t: 'Площадка на десять модулей', x: 'Модули повторяют ЦОД-1 и стоят в два ряда по пять вдоль центральной магистрали. Энергоблоки остаются по краям каждого модуля.', r: 'Концепция размещения · генплан не утверждён', campus: { built: 1, plots: true }, d: 7 },
  { t: 'Очереди 2–5', x: 'Каждая очередь — такой же модуль на 50 МВт: свои залы, энергоблоки и распределительное устройство 35 кВ со стороны магистрали.', r: '250 МВт после пятой очереди', campus: { built: 5, plots: true }, d: 7 },
  { t: 'Очереди 6–10', x: 'Второй ряд модулей замыкает кампус. Правый ряд зеркальный: все распределительные устройства смотрят на магистраль.', r: '10 × 50 МВт = 500 МВт', campus: { built: 10, plots: false }, d: 7 },
  { t: 'Общая подстанция 500 кВ', x: 'Главная подстанция кампуса стоит в торце магистрали. ЦОД-1 сохраняет свою подстанцию.', r: 'ГПП · концепция', campus: { built: 10, gpp: true }, d: 6.5 },
  { t: 'Энергия к каждому модулю', x: 'Линии идут от ГПП по инженерному коридору вдоль магистрали и ответвляются к распределительному устройству каждого модуля.', r: 'Магистраль · инженерный коридор', campus: { built: 10, gpp: true, lines: true }, d: 7 },
  { t: 'Кампус 500 МВт', x: 'Десять модулей, общая подстанция и магистраль. «Макет» возвращает к ЦОД-1 со всеми слоями и историями.', r: '500 МВт · 10 очередей', campus: { built: 10, gpp: true, lines: true }, d: 7 },
] };
export const LAYER_STORIES = {
  compute: ['server', 'compute'], power: ['energy', 'gridloss', 'powerpath'], cooling: ['heat', 'coolreserve'],
  network: ['network', 'compute'], continuity: ['safety'], construction: ['server', 'energy', 'heat'],
  overview: ['campus', 'server', 'energy'], campus: ['campus'],
};
export const SHOW = ['server', 'energy', 'heat', 'network', 'safety', 'campus']; // ▶ Показ: all of them in a row

// ------------------------------------------------------------------ light routes
export function tubeMaterial(color, fault, rev) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, grow: { value: 0 }, fade: { value: 0 }, color: { value: color.clone() }, fault: { value: fault ? 1 : 0 }, dir: { value: rev ? -1 : 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float time, grow, fade, fault, dir; uniform vec3 color;
      void main(){
        if (vUv.x > grow) discard;
        if (fault > 0.5 && vUv.x > 0.44 && vUv.x < 0.56) discard;
        float p = fract(vUv.x * 5.0 - dir * time * 0.45);
        float pulse = (1.0 - fault) * smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.08, 0.2, p));
        vec3 c = mix(color, vec3(1.0), 0.75 * pulse);
        gl_FragColor = vec4(c, (0.82 + 0.18 * pulse) * fade); }`,
  });
}

export class StoryPlayer {
  constructor({ model, eqByName, inspector, setLayer, labels, ui, onFrame }) {
    Object.assign(this, { model, eqByName, inspector, setLayer, labels, ui, onFrame });
    this.flows = []; this.rings = []; this.tags = [];
    this.story = null; this.i = 0; this.t = 0; this.paused = false; this.time = 0; this.queue = [];
    this.root = new THREE.Group(); this.root.name = 'Story visuals'; model.add(this.root);
    this.ringGeo = new THREE.RingGeometry(1, 1.18, 64).rotateX(-Math.PI / 2);
  }
  get active() { return !!this.story; }
  unit(n) { return this.eqByName.get(n) || null; }
  point(e) { return new THREE.Vector3(e.pos.x, e.pos.y + e.y + e.height * 0.78 + 1.5, e.pos.z); }

  play(id, queue = []) {
    this.stop(true);
    const st = STORIES[id]; if (!st) return;
    this.story = { id, ...st }; this.queue = queue; this.i = -1; this.paused = false;
    this.setLayer(st.layer, true);
    this.go(0);
    this.ui.show(this);
  }
  stop(silent) {
    if (!this.story) return;
    this.clear(); this.unpinAll();
    this.inspector.fx = { rotor: 1, engine: false };
    if (this.inspector.open) this.inspector.close();
    this.onFrame(null);
    this.story = null; this.queue = [];
    if (!silent) this.ui.hide();
  }
  next() { if (!this.story) return; if (this.i + 1 < this.story.steps.length) this.go(this.i + 1); else this.finish(); }
  prev() { if (this.story && this.i > 0) this.go(this.i - 1); }
  toggle() { this.paused = !this.paused; this.ui.update(this); }
  finish() {
    if (this.queue.length) { const [n, ...rest] = this.queue; this.play(n, rest); return; }
    this.stop();
  }

  async go(i) {
    const st = this.story, step = st.steps[i];
    this.i = i; this.t = 0;
    this.ui.update(this);
    // routes, rings, captions (cross-fade: the old ones are replaced)
    this.clear(); this.unpinAll();
    this.inspector.fx = { rotor: 1, engine: false, ...(step.fx || {}) };
    for (const [a, b, col, mode] of step.flows || []) this.addFlow(a, b, col, mode === 'fault', mode === 'rev');
    for (const f of step.focus || []) this.addRing(...(Array.isArray(f) ? f : [f, 'blue']));
    for (const [u, text, col] of step.tags || []) this.addTag(u, text, col || 'blue');
    if (step.campus && this.campus) this.campus.apply(step.campus);
    // the inspected unit: the state this step implies (the last "open" at or before it, so ◀ / ▶ jumps stay consistent)
    let want = { open: undefined };
    for (let k = 0; k <= i; k++) { const s = st.steps[k]; if ('open' in s) want = { open: s.open, level: s.level, tray: s.tray }; else { if (s.level !== undefined) want.level = s.level; if (s.tray) want.tray = s.tray; } }
    const insp = this.inspector;
    if (want.open === undefined) return;
    if (want.open === null || want.tray === 'in') {
      if (want.tray === 'in' && insp.s?.tray) { insp.trayBack(); await this.until(() => !insp.s?.tray, 5000); if (this.story !== st || this.i !== i) return; }
      if (insp.open) insp.close(); this.onFrame(null); return;
    }
    const e = this.unit(want.open); if (!e) return;
    if (!insp.open || insp.selected !== e || insp.s?.returning) { await insp.openUnit(e); if (this.story !== st || this.i !== i) return; }
    this.onFrame(e);
    await this.waitReady();
    if (this.story !== st || this.i !== i) return;
    if (want.tray === 'out') {
      if (!insp.s.tray) { const folding = insp.s.explode > 0.05; insp.setLevel(0); await this.wait(folding ? 900 : 200); if (this.story === st && this.i === i) insp.pullTrayByName('ComputeTray_09'); }
    } else {
      if (insp.s.tray) { insp.trayBack(); await this.until(() => !insp.s?.tray, 5000); if (this.story !== st || this.i !== i) return; }
      insp.setLevel(want.level || 0);
    }
  }
  wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  async until(fn, ms) { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await this.wait(100); }
  async waitReady() { await this.until(() => this.inspector.s?.ready && this.inspector.s.open > 0.95, 4000); }

  pin(e) { if (e && !e.pinned) { e.pinned = true; this.pinned = (this.pinned || []).concat(e); } }
  unpinAll() { for (const e of this.pinned || []) e.pinned = false; this.pinned = []; }

  addFlow(a, b, col, fault, rev) {
    const ea = this.unit(a), eb = this.unit(b); if (!ea || !eb) return;
    this.pin(ea); this.pin(eb);
    const mat = tubeMaterial(C[col] || C.blue, fault, rev);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false;
    this.root.add(mesh);
    this.flows.push({ ea, eb, mesh, mat, key: '', delay: this.flows.length * 0.09, side: col === 'blue' ? -2.5 : 2.5 });
  }
  addRing(u, col) {
    const e = this.unit(u); if (!e) return; this.pin(e);
    const mat = new THREE.MeshBasicMaterial({ color: C[col] || C.blue, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat); this.root.add(m);
    this.rings.push({ e, m, mat });
  }
  addTag(u, text, col) {
    const e = this.unit(u); if (!e || this.tags.length >= 4) return; this.pin(e);
    const el = document.createElement('div'); el.className = 'tag story'; el.textContent = text; el.style.borderColor = CSS[col] || CSS.blue; el.style.opacity = 0;
    this.labels.appendChild(el); this.tags.push({ e, el });
  }
  clear() {
    for (const f of this.flows) { f.mesh.geometry.dispose(); f.mat.dispose(); f.mesh.removeFromParent(); }
    for (const r of this.rings) { r.mat.dispose(); r.m.removeFromParent(); }
    for (const t of this.tags) t.el.remove();
    this.flows = []; this.rings = []; this.tags = [];
  }

  tick(dt) {
    this.time += dt;
    if (!this.story) return;
    const step = this.story.steps[this.i];
    if (!this.paused && !this.inspector.s?.returning) { this.t += dt; if (this.t > (step.d || 6)) this.next(); }
    this.ui.progress(this, Math.min(1, this.t / (step.d || 6)));
    for (const f of this.flows) {
      const a = this.point(f.ea), b = this.point(f.eb);
      const key = `${a.x.toFixed(0)},${a.y.toFixed(0)},${b.y.toFixed(0)}`;
      if (key !== f.key) { // rebuild the tube when an end moved (layers lift the units)
        f.key = key;
        const y = Math.max(38, Math.max(a.y, b.y) + 7.5), z = (a.z + b.z) / 2 + f.side;
        const pts = [a, new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(a.x, y, z), new THREE.Vector3(b.x, y, z), new THREE.Vector3(b.x, y, b.z), b];
        const path = new THREE.CurvePath(); for (let k = 1; k < pts.length; k++) if (pts[k].distanceTo(pts[k - 1]) > 0.01) path.add(new THREE.LineCurve3(pts[k - 1], pts[k]));
        f.mesh.geometry.dispose(); f.mesh.geometry = new THREE.TubeGeometry(path, 160, 2.2, 8, false);
      }
      const age = this.t - f.delay;
      f.mat.uniforms.time.value = this.time; f.mat.uniforms.grow.value = smooth01(age / 1.6); f.mat.uniforms.fade.value = smooth01(age / 0.75);
    }
    for (const r of this.rings) {
      const e = r.e, rad = Math.max(3, e.radius * 0.9);
      r.m.position.set(e.pos.x, e.pos.y + e.y + 0.4, e.pos.z); r.m.scale.setScalar(rad * (1 + 0.08 * Math.sin(this.time * 3)));
      r.mat.opacity = 0.55 + 0.35 * Math.sin(this.time * 3);
    }
  }
  drawTags(cam) {
    const v = new THREE.Vector3();
    for (const t of this.tags) {
      v.copy(this.point(t.e)); v.y += 4; this.model.localToWorld(v).project(cam);
      const show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && this.t > 0.6;
      t.el.style.opacity = show ? 1 : 0;
      if (show) { t.el.style.left = (v.x + 1) / 2 * innerWidth + 'px'; t.el.style.top = (1 - v.y) / 2 * innerHeight + 'px'; }
    }
  }
}
const smooth01 = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
