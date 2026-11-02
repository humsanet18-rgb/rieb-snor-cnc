import { useStore } from '../stores/store';
import { uiStore, type Lang } from '../stores/ui-store';
import type { ImportIssueCode } from '../engines/svg-parser/report';
import type { ValidationCode } from '../engines/toolpath-engine/validate';
import { shopEn, shopKm } from './i18n-shop';
import { uiEn, uiKm } from './i18n-ui';
import { modalEn, modalKm } from './i18n-modal';

const en = {
  ...shopEn,
  ...uiEn,
  ...modalEn,
  'app.name': 'រៀបអក្សរ CNC',
  'app.tagline': 'Foam nesting and Mach3 toolpaths',
  'nav.new': 'New', 'nav.open': 'Open', 'nav.save': 'Save', 'nav.undo': 'Undo', 'nav.redo': 'Redo',
  'nav.help': 'Help', 'nav.settings': 'App settings', 'nav.lang': 'ខ្មែរ', 'nav.dark': 'Dark theme', 'nav.light': 'Light theme',
  'save.saved': 'Saved on this device', 'save.saving': 'Saving…', 'save.error': 'Not saved',
  'save.error.quota': 'Browser storage is full. Export a project backup.', 'save.error.other': 'This browser blocked local saving. Export a project backup.',
  'project.defaultName': 'New project', 'project.rename': 'Project name',

  'step.1': 'Import SVG', 'step.2': 'Manage designs', 'step.3': 'Foam sheet', 'step.4': 'Nesting', 'step.5': 'Machine settings',
  'step.6': 'Cutting paths', 'step.7': 'Review and validate', 'step.8': 'Export', 'step.next': 'Next step',

  'import.drop': 'Drop SVG files here', 'import.pick': 'or click to choose files', 'import.hint': 'From CorelDRAW: convert text to curves first. Files stay on this device.',
  'import.samples': 'Try a sample', 'import.sample.letters': 'Block letters', 'import.sample.shapes': 'Mixed shapes', 'import.sample.warnings': 'File with problems',
  'import.progress': 'Reading {name}… ({done}/{total})', 'import.failed': 'Could not import',

  'designs.empty': 'No designs yet. Import SVG files above, or type Khmer text on the Khmer Text screen.', 'designs.pieces': '{n} pieces', 'designs.contours': '{n} contours', 'designs.size': '{w} × {h} cm',
  'designs.qty': 'Copies', 'designs.more': 'Add copy', 'designs.less': 'Remove copy', 'designs.remove': 'Remove {name}',
  'designs.report': 'Import report', 'designs.check': 'Needs correction', 'designs.fixed': 'Keep upright', 'designs.total': '{n} pieces in total',

  'report.title': 'Import report: {name}', 'report.imported': 'Imported', 'report.skipped': 'Skipped', 'report.correct': 'To correct in CorelDRAW',
  'report.none': 'Everything in this file was imported.', 'report.parts': 'Pieces', 'report.contours': 'Contours', 'report.holes': 'Holes', 'report.points': 'Points',
  'report.size': 'Size', 'report.area': 'Area', 'report.file': 'File size', 'report.nothing': 'None',

  'sheet.width': 'Width (cm)', 'sheet.height': 'Height (cm)', 'sheet.thickness': 'Thickness (mm)', 'sheet.thicknessHint': 'Recorded in the report only.',
  'sheet.margin': 'Edge margin (mm)', 'sheet.corners': 'Keep corners free (foam clamps)', 'sheet.corners.bottom': 'Two bottom corners (large Y)',
  'sheet.corners.top': 'Two top corners (Y0)', 'sheet.corners.all': 'All four corners', 'sheet.corners.none': 'None',
  'sheet.leftW': 'Left corner width (cm)', 'sheet.rightW': 'Right corner width (cm)', 'sheet.cornerH': 'Corner height (cm)',
  'sheet.topHint': 'Corner X0 Y0 is kept free, so the wire starts just past it. Set the machine zero so the head clears the clamp.',
  'sheet.start': 'Start box at corner X0 Y0', 'sheet.startX': 'Start X (mm)', 'sheet.startY': 'Start Y (mm)', 'sheet.startW': 'Box width (mm)', 'sheet.startH': 'Box height (mm)',

  'nest.mode': 'Arrangement', 'nest.mode.auto': 'Automatic', 'nest.mode.keep': 'Keep original position', 'nest.mode.manual': 'Manual adjustment',
  'nest.keepHint': 'Each file becomes one sheet, cut where it was drawn, the way FCNC does.',
  'nest.manualHint': 'Starts from an automatic layout. Then drag pieces on the canvas, or type X and Y on the right.',
  'nest.gap': 'Gap between letters (mm)', 'nest.direction': 'Direction', 'nest.rows': 'By width: rows, leftover strip at the bottom', 'nest.columns': 'By height: columns, leftover strip at the right',
  'nest.rotation': 'Rotate letters', 'nest.rot.none': 'No rotation', 'nest.rot.180': 'Flip 180° only', 'nest.rot.90': 'Every 90°', 'nest.rot.45': 'Every 45° (slower)',
  'nest.time': 'Search time', 'nest.time.3': 'Quick (3 s)', 'nest.time.8': 'Normal (8 s)', 'nest.time.20': 'Long (20 s)', 'nest.time.60': 'Very long (60 s)',
  'nest.go': 'Generate layout', 'nest.again': 'Generate again', 'nest.cancel': 'Cancel', 'nest.searching': 'Searching… {sheets} sheets, pass {pass}', 'nest.tightening': 'Tightening the layout…',
  'nest.stale': 'Settings changed. Generate again to apply them.', 'nest.layouts': 'Layouts', 'nest.best': 'Best Found Layout', 'nest.bestHint': 'The best arrangement found in the search time, not a proven optimum.',
  'nest.layoutRow': 'Layout #{n}', 'nest.use': 'Use this layout', 'nest.remove': 'Delete layout #{n}', 'nest.unplaced': '{n} pieces do not fit on the sheet. Shrink them or allow rotation.',
  'nest.col.sheets': 'Sheets', 'nest.col.util': 'Used',

  'machine.profile': 'Machine profile', 'machine.name': 'Profile name', 'machine.feed': 'Feed F (mm/min)', 'machine.power': 'Wire heat S',
  'machine.m5': 'Turn the wire off with M5 at the end', 'machine.maxX': 'Machine travel X (mm)', 'machine.maxY': 'Machine travel Y (mm)', 'machine.travelHint': 'Leave empty if not known. Paths are only checked against travel when set.',
  'machine.add': 'New profile', 'machine.duplicate': 'Duplicate', 'machine.delete': 'Delete', 'machine.copy': '{name} copy',
  'machine.warning': 'F and S here are taken from sample files. They are not proven safe for your wire, foam or machine. Confirm them yourself.',

  'path.none': 'Generate a layout first.', 'path.busy': 'Building cutting paths…', 'path.summary': 'Each sheet is one continuous stroke, because the hot wire cannot lift.',
  'path.sheet': 'Sheet {n}', 'path.length': 'Cut length', 'path.time': 'Time at F', 'path.bridges': 'Bridges', 'path.rebuild': 'Rebuild paths', 'path.timeNote': 'Time is length divided by F; real time depends on the machine.',
  'path.showOnCanvas': 'Show paths on canvas',

  'review.none': 'Nothing to check yet.', 'review.ok': 'No errors found.', 'review.errors': '{n} errors', 'review.warnings': '{n} warnings', 'review.infos': '{n} notes',
  'review.job': 'Whole job', 'review.sheet': 'Sheet {n}', 'review.count': '× {n}', 'review.blocked': 'Errors must be fixed before a TAP file can be exported.', 'review.show': 'Show on canvas',
  'review.disclaimer': 'These checks compare the file with your settings. They do not prove the file is safe to run.',

  'export.base': 'Output file name (Latin letters)', 'export.safety': 'Before cutting', 'export.s1': 'The F and S values match your wire and foam.',
  'export.s2': 'Machine zero is set at the foam corner, and the head clears every clamp.', 'export.s3': 'A dry run with the wire cold has been or will be done.', 'export.s4': 'An operator stays at the machine.',
  'export.confirm': 'I checked this layout and accept responsibility for running it. I understand this software does not guarantee the G-code is safe.',
  'export.all': 'All sheets (.zip)', 'export.tap': 'TAP', 'export.svg': 'SVG', 'export.project': 'Project backup (.json)', 'export.pdf': 'Cutting report (PDF)', 'export.pdfBusy': 'Making report…',
  'export.needConfirm': 'Tick the confirmation to enable TAP files.', 'export.after': 'In Mach3: File → Load G-Code. Set X and Y zero at the foam corner as usual.',

  'canvas.fit': 'Fit to view', 'canvas.zoomIn': 'Zoom in', 'canvas.zoomOut': 'Zoom out', 'canvas.layers': 'Layers', 'canvas.sheetOf': 'Sheet {n} / {total}', 'canvas.prev': 'Previous sheet', 'canvas.next': 'Next sheet',
  'layer.designs': 'Designs', 'layer.toolpath': 'Wire path', 'layer.bridges': 'Bridges', 'layer.zones': 'Clamp zones', 'layer.start': 'Start point', 'layer.grid': 'Grid', 'layer.order': 'Cutting order',
  'canvas.empty.title': 'Nest foam letters and cut them with Mach3', 'canvas.empty.body': 'Import SVG files from CorelDRAW. The app arranges them on the foam sheet, joins them into one wire stroke and writes a TAP file. Everything runs in your browser.',
  'canvas.preview': 'Sheet preview, {w} × {h} mm', 'canvas.noLayout': 'Designs are ready. Generate a layout in Nesting to place them on the sheet.',
  'play.play': 'Play', 'play.pause': 'Pause', 'play.speed': 'Speed', 'play.position': 'Wire position', 'play.note': 'Shows the path data only. It does not simulate the machine.', 'play.toStart': 'Back to start',

  'props.title': 'Properties', 'props.piece': 'Piece', 'props.design': 'Design', 'props.copy': 'Copy', 'props.x': 'X (mm)', 'props.y': 'Y (mm)', 'props.w': 'Width', 'props.h': 'Height', 'props.rotation': 'Rotation (°)',
  'props.rotate90': 'Rotate 90°', 'props.area': 'Area', 'props.outers': 'Outer contours', 'props.holes': 'Holes', 'props.points': 'Points', 'props.moveSheet': 'Move to sheet', 'props.manualOnly': 'Choose Manual adjustment in Nesting to change position.',
  'props.none': 'Select a piece on the canvas.', 'props.sheet': 'This sheet', 'props.job': 'This layout', 'props.sheets': 'Sheets', 'props.pieces': 'Pieces', 'props.usedArea': 'Used area', 'props.utilization': 'Utilization', 'props.waste': 'Waste',
  'props.cut': 'Cutting distance', 'props.leftover': 'Leftover strip', 'props.deselect': 'Clear selection',

  'open.title': 'Open project', 'open.recent': 'Recent projects', 'open.none': 'No saved projects on this device.', 'open.local': 'Projects are stored in this browser on this device only. They are lost if browser data is cleared. Export a backup to keep them safe.',
  'open.import': 'Import backup (.json)', 'open.open': 'Open', 'open.duplicate': 'Duplicate', 'open.delete': 'Delete', 'open.deleteConfirm': 'Delete “{name}” from this device?', 'open.summary': 'Designs: {designs} · Sheets: {sheets} · {date}',
  'open.badFile': 'That backup file is not valid ({why}). Nothing was changed.', 'open.copyOf': '{name} (copy)',

  'settings.title': 'App settings', 'settings.language': 'Language', 'settings.theme': 'Theme', 'settings.storage': 'Storage on this device', 'settings.storageUse': '{used} of {quota} used', 'settings.storageUnknown': 'This browser does not report storage use.',
  'settings.clear': 'Delete all local projects and profiles', 'settings.clearConfirm': 'Delete every project and machine profile stored in this browser? This cannot be undone.', 'settings.cleared': 'Local data deleted.',
  'settings.privacy': 'No account, no upload. All calculation runs in your browser.', 'common.close': 'Close', 'common.cancel': 'Cancel',

  'help.title': 'How to use', 'help.flow': 'Work down the screens in the sidebar: import or type the designs, nest them, check the machine and the path, then export. Home shows where the job stands.', 'help.h1': 'Prepare the file', 'help.b1': 'In CorelDRAW, convert text to curves and export SVG. Weld letters that touch.',
  'help.h2': 'Clamp corners', 'help.b2': 'Nesting keeps corners free so the head does not hit the clamps. No letter and no wire path enters them.',
  'help.h3': 'Keys', 'help.b3': 'Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save. On the canvas: wheel or pinch to zoom, drag to pan, Shift-drag or the box tool to select an area, Shift-click to add a piece, Ctrl+A to select the whole sheet. In manual mode: arrows nudge 1 mm (Shift: 10 mm), R rotates 90°, Esc clears the selection.',
  'help.h4': 'Safety', 'help.b4': 'This app has not been tested on your machine. Check every TAP file in Mach3, dry-run with the wire cold, and stay at the machine. The hot wire and fumes are your responsibility to manage.',
  'help.h5': 'Your data', 'help.b5': 'Files are read in the browser and are never uploaded. Saved projects stay on this device.',

  'toast.imported': '{n} files imported', 'toast.failed': 'Something went wrong: {why}', 'toast.noDesigns': 'Import an SVG file first.', 'toast.unplaced': '{n} pieces did not fit.', 'toast.cancelled': 'Cancelled.',
  'toast.saved': 'Saved {name}', 'toast.confirmFirst': 'Fix all errors and tick the confirmation first.', 'toast.projectSaved': 'Project saved on this device.', 'toast.restored': 'Project restored.', 'toast.offline': 'Ready to work offline.',

  'unit.m': 'm', 'unit.minutes': '{m} min', 'unit.hours': '{h} h {m} min', 'unit.cm2': 'cm²',

  'pdf.title': 'Cutting report', 'pdf.project': 'Project', 'pdf.date': 'Date', 'pdf.foam': 'Foam', 'pdf.sheets': 'Sheets', 'pdf.pieces': 'Pieces', 'pdf.utilization': 'Utilization', 'pdf.cut': 'Cutting distance',
  'pdf.profile': 'Machine profile', 'pdf.validation': 'Validation results', 'pdf.page': 'Page {n}', 'pdf.note': 'Check every file on the machine before cutting. This report does not guarantee safe operation.',
  'view.tabs': 'Screen', 'view.work': 'Workflow', 'view.editor': 'EDITOR',
  'nest.arrange': 'Arrangement', 'nest.arrange.free': 'Save foam', 'nest.arrange.rows': 'Same-height rows',
  'nest.rowsHint': 'Letters stay upright. Letters of about the same height share a row, and each row sits below the last.',
  'nest.tolerance': 'Height difference allowed (mm)', 'nest.align': 'Line up in the row', 'nest.align.bottom': 'Bottom', 'nest.align.top': 'Top', 'nest.align.center': 'Middle',
  'nest.rowOrder': 'Row order', 'nest.rowOrder.height': 'Tallest first', 'nest.rowOrder.file': 'As in the file',
  'nest.fillGaps': 'Fill row ends with shorter letters', 'nest.tight': 'Close up along the letter shapes',
  'cut.order': 'Cutting order', 'cut.order.shortest': 'Shortest path', 'cut.order.rows': 'Row by row, top to bottom', 'cut.order.columns': 'Column by column, left to right', 'cut.order.snake': 'Piece by piece, zigzag',
  'cut.hint': 'The wire finishes one group, follows a line already cut, then crosses to the next group.',
  'cut.returnHome': 'Return to the start point at the end',
  'cut.noReturn': 'The file ends in the last group without walking back. The wire stays in the foam there.',
  'path.openEditor': 'Open the EDITOR',
  'editor.empty': 'Generate a layout first. The cutting path then appears here.', 'editor.options': 'Cutting options', 'editor.position': 'Wire position',
  'editor.done': 'Done', 'editor.left': 'Left', 'editor.timeLeft': 'Time left at F', 'editor.piece': 'Piece', 'editor.move': 'Move', 'editor.retrace': 'Over cut lines',
  'editor.prevPiece': 'Previous piece', 'editor.nextPiece': 'Next piece', 'editor.prevMove': 'Previous move', 'editor.nextMove': 'Next move',
  'editor.follow': 'Follow the wire', 'editor.manual': 'Move pieces by hand', 'editor.manualHint': 'Drag pieces on the sheet. The path rebuilds by itself.',
  'editor.gcode': 'G-code', 'editor.gcodeHint': 'Click a line to put the wire there.',
};

export type Key = keyof typeof en;

const km: Record<Key, string> = {
  ...shopKm,
  ...uiKm,
  ...modalKm,
  'app.name': 'រៀបអក្សរ CNC',
  'app.tagline': 'រៀបស្នោ និងបង្កើតផ្លូវកាត់សម្រាប់ Mach3',
  'nav.new': 'ថ្មី', 'nav.open': 'បើក', 'nav.save': 'រក្សាទុក', 'nav.undo': 'ថយក្រោយ', 'nav.redo': 'ទៅមុខវិញ',
  'nav.help': 'ជំនួយ', 'nav.settings': 'ការកំណត់កម្មវិធី', 'nav.lang': 'EN', 'nav.dark': 'ផ្ទៃងងឹត', 'nav.light': 'ផ្ទៃភ្លឺ',
  'save.saved': 'បានរក្សាទុកក្នុងឧបករណ៍នេះ', 'save.saving': 'កំពុងរក្សាទុក…', 'save.error': 'មិនទាន់បានរក្សាទុក',
  'save.error.quota': 'កន្លែងផ្ទុកក្នុងកម្មវិធីរុករកពេញហើយ។ សូមនាំចេញឯកសារបម្រុងទុក។', 'save.error.other': 'កម្មវិធីរុករកនេះមិនអនុញ្ញាតឱ្យរក្សាទុកទេ។ សូមនាំចេញឯកសារបម្រុងទុក។',
  'project.defaultName': 'គម្រោងថ្មី', 'project.rename': 'ឈ្មោះគម្រោង',

  'step.1': 'នាំចូល SVG', 'step.2': 'គ្រប់គ្រងរូប', 'step.3': 'សន្លឹកស្នោ', 'step.4': 'រៀបស្នោ', 'step.5': 'ការកំណត់ម៉ាស៊ីន',
  'step.6': 'ផ្លូវកាត់', 'step.7': 'ពិនិត្យ និងផ្ទៀងផ្ទាត់', 'step.8': 'នាំចេញ', 'step.next': 'ជំហានបន្ទាប់',

  'import.drop': 'ទម្លាក់ឯកសារ SVG នៅទីនេះ', 'import.pick': 'ឬចុចដើម្បីជ្រើសរើសឯកសារ', 'import.hint': 'ពី CorelDRAW៖ សូម Convert to Curves ជាមុនសិន។ ឯកសារនៅក្នុងឧបករណ៍នេះ មិនបញ្ជូនទៅណាទេ។',
  'import.samples': 'សាកល្បងឧទាហរណ៍', 'import.sample.letters': 'អក្សរប្លុក', 'import.sample.shapes': 'រូបចម្រុះ', 'import.sample.warnings': 'ឯកសារមានបញ្ហា',
  'import.progress': 'កំពុងអាន {name}… ({done}/{total})', 'import.failed': 'នាំចូលមិនបាន',

  'designs.empty': 'មិនទាន់មានរូបទេ។ សូមនាំចូលឯកសារ SVG ខាងលើ ឬវាយអក្សរនៅទំព័រអក្សរខ្មែរ។', 'designs.pieces': '{n} ដុំ', 'designs.contours': '{n} ខ្សែកាត់', 'designs.size': '{w} × {h} cm',
  'designs.qty': 'ចំនួនច្បាប់', 'designs.more': 'បន្ថែមមួយច្បាប់', 'designs.less': 'បន្ថយមួយច្បាប់', 'designs.remove': 'ដក {name} ចេញ',
  'designs.report': 'របាយការណ៍នាំចូល', 'designs.check': 'ត្រូវកែ', 'designs.fixed': 'រក្សាទិសដើម មិនបង្វិល', 'designs.total': 'សរុប {n} ដុំ',

  'report.title': 'របាយការណ៍នាំចូល៖ {name}', 'report.imported': 'បាននាំចូល', 'report.skipped': 'បានរំលង', 'report.correct': 'ត្រូវកែក្នុង CorelDRAW',
  'report.none': 'អ្វីៗក្នុងឯកសារនេះបាននាំចូលទាំងអស់។', 'report.parts': 'ដុំ', 'report.contours': 'ខ្សែកាត់', 'report.holes': 'រន្ធ', 'report.points': 'ចំណុច',
  'report.size': 'ទំហំ', 'report.area': 'ផ្ទៃក្រឡា', 'report.file': 'ទំហំឯកសារ', 'report.nothing': 'គ្មាន',

  'sheet.width': 'ទទឹង (cm)', 'sheet.height': 'កម្ពស់ (cm)', 'sheet.thickness': 'កម្រាស់ (mm)', 'sheet.thicknessHint': 'កត់ត្រាក្នុងរបាយការណ៍ប៉ុណ្ណោះ។',
  'sheet.margin': 'គែមទុក (mm)', 'sheet.corners': 'ទុកកែងទំនេរ (ឧបករណ៍គៀបស្នោ)', 'sheet.corners.bottom': 'កែងខាងក្រោម ២ (Y ធំ)',
  'sheet.corners.top': 'កែងខាងលើ ២ (Y0)', 'sheet.corners.all': 'ទាំង ៤ កែង', 'sheet.corners.none': 'មិនទុក',
  'sheet.leftW': 'ទទឹងកែងឆ្វេង (cm)', 'sheet.rightW': 'ទទឹងកែងស្ដាំ (cm)', 'sheet.cornerH': 'កម្ពស់កែង (cm)',
  'sheet.topHint': 'កែង X0 Y0 ក៏ទុកទំនេរដែរ ដូច្នេះលួសចាប់ផ្តើមក្រោយកែងនោះ។ សូមកំណត់សូន្យម៉ាស៊ីនឱ្យក្បាលមិនប៉ះឧបករណ៍គៀប។',
  'sheet.start': 'ប្រអប់ចាប់ផ្តើមនៅជ្រុង X0 Y0', 'sheet.startX': 'ចាប់ផ្តើម X (mm)', 'sheet.startY': 'ចាប់ផ្តើម Y (mm)', 'sheet.startW': 'ទទឹងប្រអប់ (mm)', 'sheet.startH': 'កម្ពស់ប្រអប់ (mm)',

  'nest.mode': 'របៀបរៀប', 'nest.mode.auto': 'រៀបស្វ័យប្រវត្តិ', 'nest.mode.keep': 'រក្សាទីតាំងដើម', 'nest.mode.manual': 'កែទីតាំងដោយដៃ',
  'nest.keepHint': 'ឯកសារនីមួយៗជាមួយសន្លឹក កាត់នៅទីតាំងដែលគូរ ដូច FCNC។',
  'nest.manualHint': 'ចាប់ផ្តើមពីការរៀបស្វ័យប្រវត្តិ។ បន្ទាប់មកអូសដុំស្នោលើផ្ទាំង ឬវាយ X និង Y នៅខាងស្ដាំ។',
  'nest.gap': 'ចន្លោះអក្សរ (mm)', 'nest.direction': 'ទិសរៀប', 'nest.rows': 'រៀបទទឹង (ជាជួរ សល់បន្ទះខាងក្រោម)', 'nest.columns': 'រៀបកម្ពស់ (ជាសសរ សល់បន្ទះខាងស្ដាំ)',
  'nest.rotation': 'បង្វិលអក្សរ', 'nest.rot.none': 'មិនបង្វិល', 'nest.rot.180': 'តែក្រឡាប់ 180°', 'nest.rot.90': 'រាល់ 90°', 'nest.rot.45': 'រាល់ 45° (យឺតជាង)',
  'nest.time': 'រយៈពេលស្វែងរក', 'nest.time.3': 'លឿន (3 វិនាទី)', 'nest.time.8': 'ធម្មតា (8 វិនាទី)', 'nest.time.20': 'យូរ (20 វិនាទី)', 'nest.time.60': 'យូរណាស់ (60 វិនាទី)',
  'nest.go': 'រៀបស្នោ', 'nest.again': 'រៀបម្ដងទៀត', 'nest.cancel': 'បោះបង់', 'nest.searching': 'កំពុងរៀប… {sheets} សន្លឹក ជុំទី {pass}', 'nest.tightening': 'កំពុងតម្រឹមឱ្យជិត…',
  'nest.stale': 'ការកំណត់បានផ្លាស់ប្ដូរ។ សូមរៀបម្ដងទៀតដើម្បីអនុវត្ត។', 'nest.layouts': 'ប្លង់ដែលបានបង្កើត', 'nest.best': 'ប្លង់ល្អបំផុតដែលរកឃើញ', 'nest.bestHint': 'នេះជាប្លង់ល្អបំផុតដែលរកឃើញក្នុងរយៈពេលស្វែងរក មិនមែនបញ្ជាក់ថាល្អដាច់ខាតទេ។',
  'nest.layoutRow': 'ប្លង់ #{n}', 'nest.use': 'ប្រើប្លង់នេះ', 'nest.remove': 'លុបប្លង់ #{n}', 'nest.unplaced': 'មាន {n} ដុំដាក់លើសន្លឹកមិនបាន។ សូមបង្រួម ឬអនុញ្ញាតឱ្យបង្វិល។',
  'nest.col.sheets': 'សន្លឹក', 'nest.col.util': 'ប្រើស្នោ',

  'machine.profile': 'ប្រវត្តិរូបម៉ាស៊ីន', 'machine.name': 'ឈ្មោះប្រវត្តិរូប', 'machine.feed': 'ល្បឿនកាត់ F (mm/នាទី)', 'machine.power': 'កម្តៅលួស S',
  'machine.m5': 'បិទលួសដោយ M5 នៅចុងកម្មវិធី', 'machine.maxX': 'ចម្ងាយម៉ាស៊ីន X (mm)', 'machine.maxY': 'ចម្ងាយម៉ាស៊ីន Y (mm)', 'machine.travelHint': 'ទុកទទេបើមិនដឹង។ កម្មវិធីពិនិត្យចម្ងាយតែពេលបានបំពេញប៉ុណ្ណោះ។',
  'machine.add': 'ប្រវត្តិរូបថ្មី', 'machine.duplicate': 'ចម្លង', 'machine.delete': 'លុប', 'machine.copy': '{name} ច្បាប់ចម្លង',
  'machine.warning': 'តម្លៃ F និង S នេះយកពីឯកសារគំរូ។ វាមិនទាន់បញ្ជាក់ថាសុវត្ថិភាពសម្រាប់លួស ស្នោ ឬម៉ាស៊ីនរបស់អ្នកទេ។ សូមផ្ទៀងផ្ទាត់ដោយខ្លួនឯង។',

  'path.none': 'សូមរៀបស្នោជាមុនសិន។', 'path.busy': 'កំពុងបង្កើតផ្លូវកាត់…', 'path.summary': 'សន្លឹកនីមួយៗជាខ្សែតែមួយជាប់គ្នា ព្រោះលួសក្ដៅមិនអាចលើកឡើងបានទេ។',
  'path.sheet': 'សន្លឹក {n}', 'path.length': 'ប្រវែងកាត់', 'path.time': 'ពេលកាត់តាម F', 'path.bridges': 'ខ្សែភ្ជាប់', 'path.rebuild': 'បង្កើតផ្លូវកាត់ឡើងវិញ', 'path.timeNote': 'ពេលកាត់គិតពីប្រវែងចែកនឹង F។ ពេលពិតអាស្រ័យលើម៉ាស៊ីន។',
  'path.showOnCanvas': 'បង្ហាញផ្លូវកាត់លើផ្ទាំង',

  'review.none': 'មិនទាន់មានអ្វីត្រូវពិនិត្យទេ។', 'review.ok': 'រកមិនឃើញកំហុសទេ។', 'review.errors': 'កំហុស {n}', 'review.warnings': 'ការព្រមាន {n}', 'review.infos': 'កំណត់ចំណាំ {n}',
  'review.job': 'ការងារទាំងមូល', 'review.sheet': 'សន្លឹក {n}', 'review.count': '× {n}', 'review.blocked': 'ត្រូវកែកំហុសទាំងអស់សិន ទើបនាំចេញ TAP បាន។', 'review.show': 'បង្ហាញលើផ្ទាំង',
  'review.disclaimer': 'ការពិនិត្យនេះប្រៀបធៀបឯកសារជាមួយការកំណត់របស់អ្នកប៉ុណ្ណោះ។ វាមិនបញ្ជាក់ថាឯកសារមានសុវត្ថិភាពពេលដំណើរការទេ។',

  'export.base': 'ឈ្មោះឯកសារចេញ (អក្សរឡាតាំង)', 'export.safety': 'មុនពេលកាត់', 'export.s1': 'តម្លៃ F និង S ត្រូវនឹងលួស និងស្នោរបស់អ្នក។',
  'export.s2': 'សូន្យម៉ាស៊ីនកំណត់នៅជ្រុងស្នោ ហើយក្បាលមិនប៉ះឧបករណ៍គៀបណាមួយ។', 'export.s3': 'បានសាកដំណើរការទទេដោយលួសមិនក្ដៅ ឬនឹងធ្វើមុនកាត់។', 'export.s4': 'មានអ្នកបញ្ជានៅជាប់ម៉ាស៊ីន។',
  'export.confirm': 'ខ្ញុំបានពិនិត្យប្លង់នេះ ហើយទទួលខុសត្រូវលើការដំណើរការ។ ខ្ញុំយល់ថាកម្មវិធីនេះមិនធានាថា G-code មានសុវត្ថិភាពទេ។',
  'export.all': 'គ្រប់សន្លឹក (.zip)', 'export.tap': 'TAP', 'export.svg': 'SVG', 'export.project': 'ឯកសារបម្រុងគម្រោង (.json)', 'export.pdf': 'របាយការណ៍កាត់ (PDF)', 'export.pdfBusy': 'កំពុងធ្វើរបាយការណ៍…',
  'export.needConfirm': 'សូមគូសធីកការបញ្ជាក់ ដើម្បីបើកឯកសារ TAP។', 'export.after': 'ក្នុង Mach3៖ File → Load G-Code។ កំណត់សូន្យ X Y នៅជ្រុងស្នោដូចសព្វមួយដង។',

  'canvas.fit': 'បង្ហាញពេញផ្ទាំង', 'canvas.zoomIn': 'ពង្រីក', 'canvas.zoomOut': 'បង្រួម', 'canvas.layers': 'ស្រទាប់', 'canvas.sheetOf': 'សន្លឹក {n} / {total}', 'canvas.prev': 'សន្លឹកមុន', 'canvas.next': 'សន្លឹកបន្ទាប់',
  'layer.designs': 'រូប', 'layer.toolpath': 'ផ្លូវលួស', 'layer.bridges': 'ខ្សែភ្ជាប់', 'layer.zones': 'កែងទុកទំនេរ', 'layer.start': 'ចំណុចចាប់ផ្តើម', 'layer.grid': 'ក្រឡាចត្រង្គ', 'layer.order': 'លំដាប់កាត់',
  'canvas.empty.title': 'រៀបអក្សរស្នោ ហើយកាត់ជាមួយ Mach3', 'canvas.empty.body': 'នាំចូលឯកសារ SVG ពី CorelDRAW។ កម្មវិធីរៀបវាលើសន្លឹកស្នោ ភ្ជាប់ជាខ្សែលួសតែមួយ ហើយបង្កើតឯកសារ TAP។ អ្វីៗដំណើរការក្នុងកម្មវិធីរុករករបស់អ្នក។',
  'canvas.preview': 'ប្លង់សន្លឹកស្នោ {w} × {h} mm', 'canvas.noLayout': 'រូបរួចរាល់ហើយ។ សូមបង្កើតប្លង់នៅទំព័ររៀបស្នោ ដើម្បីដាក់វាលើសន្លឹក។',
  'play.play': 'ចាក់', 'play.pause': 'ផ្អាក', 'play.speed': 'ល្បឿន', 'play.position': 'ទីតាំងលួស', 'play.note': 'បង្ហាញទិន្នន័យផ្លូវកាត់ប៉ុណ្ណោះ មិនមែនការក្លែងធ្វើម៉ាស៊ីនទេ។', 'play.toStart': 'ត្រឡប់ទៅដើម',

  'props.title': 'លក្ខណៈ', 'props.piece': 'ដុំ', 'props.design': 'រូប', 'props.copy': 'ច្បាប់', 'props.x': 'X (mm)', 'props.y': 'Y (mm)', 'props.w': 'ទទឹង', 'props.h': 'កម្ពស់', 'props.rotation': 'បង្វិល (°)',
  'props.rotate90': 'បង្វិល 90°', 'props.area': 'ផ្ទៃក្រឡា', 'props.outers': 'ខ្សែក្រៅ', 'props.holes': 'រន្ធ', 'props.points': 'ចំណុច', 'props.moveSheet': 'ផ្លាស់ទៅសន្លឹក', 'props.manualOnly': 'ជ្រើស «កែទីតាំងដោយដៃ» នៅទំព័ររៀបស្នោ ដើម្បីប្ដូរទីតាំង។',
  'props.none': 'ជ្រើសដុំស្នោលើផ្ទាំង។', 'props.sheet': 'សន្លឹកនេះ', 'props.job': 'ប្លង់នេះ', 'props.sheets': 'សន្លឹក', 'props.pieces': 'ដុំ', 'props.usedArea': 'ផ្ទៃប្រើ', 'props.utilization': 'ប្រើស្នោ', 'props.waste': 'ខ្ជះខ្ជាយ',
  'props.cut': 'ប្រវែងកាត់', 'props.leftover': 'បន្ទះសល់', 'props.deselect': 'ដកការជ្រើស',

  'open.title': 'បើកគម្រោង', 'open.recent': 'គម្រោងថ្មីៗ', 'open.none': 'មិនមានគម្រោងរក្សាទុកក្នុងឧបករណ៍នេះទេ។', 'open.local': 'គម្រោងរក្សាទុកក្នុងកម្មវិធីរុករកនេះ លើឧបករណ៍នេះប៉ុណ្ណោះ។ វានឹងបាត់បើសម្អាតទិន្នន័យកម្មវិធីរុករក។ សូមនាំចេញឯកសារបម្រុងទុក។',
  'open.import': 'នាំចូលឯកសារបម្រុង (.json)', 'open.open': 'បើក', 'open.duplicate': 'ចម្លង', 'open.delete': 'លុប', 'open.deleteConfirm': 'លុប “{name}” ចេញពីឧបករណ៍នេះឬ?', 'open.summary': '{designs} រូប · {sheets} សន្លឹក · {date}',
  'open.badFile': 'ឯកសារបម្រុងនេះមិនត្រឹមត្រូវ ({why})។ មិនមានអ្វីផ្លាស់ប្ដូរទេ។', 'open.copyOf': '{name} (ច្បាប់ចម្លង)',

  'settings.title': 'ការកំណត់កម្មវិធី', 'settings.language': 'ភាសា', 'settings.theme': 'ពណ៌ផ្ទៃ', 'settings.storage': 'កន្លែងផ្ទុកក្នុងឧបករណ៍នេះ', 'settings.storageUse': 'ប្រើ {used} ក្នុងចំណោម {quota}', 'settings.storageUnknown': 'កម្មវិធីរុករកនេះមិនបង្ហាញទំហំផ្ទុកទេ។',
  'settings.clear': 'លុបគម្រោង និងប្រវត្តិរូបទាំងអស់', 'settings.clearConfirm': 'លុបគម្រោង និងប្រវត្តិរូបម៉ាស៊ីនទាំងអស់ក្នុងកម្មវិធីរុករកនេះឬ? មិនអាចយកមកវិញបានទេ។', 'settings.cleared': 'បានលុបទិន្នន័យហើយ។',
  'settings.privacy': 'មិនត្រូវការគណនី មិនបញ្ជូនឯកសារទេ។ ការគណនាទាំងអស់ដំណើរការក្នុងកម្មវិធីរុករករបស់អ្នក។', 'common.close': 'បិទ', 'common.cancel': 'បោះបង់',

  'help.title': 'របៀបប្រើ', 'help.flow': 'ធ្វើតាមទំព័រក្នុងម៉ឺនុយខាងឆ្វេង៖ នាំចូល ឬវាយរូប រៀបស្នោ ពិនិត្យម៉ាស៊ីន និងផ្លូវកាត់ រួចនាំចេញ។ ទំព័រដើមបង្ហាញវឌ្ឍនភាពការងារ។', 'help.h1': 'រៀបចំឯកសារ', 'help.b1': 'ក្នុង CorelDRAW សូម Convert to Curves ហើយនាំចេញ SVG។ សូម Weld អក្សរដែលប៉ះគ្នា។',
  'help.h2': 'កែងគៀបស្នោ', 'help.b2': 'ការរៀបស្នោទុកកែងទំនេរ ដើម្បីកុំឱ្យក្បាលបុកឧបករណ៍គៀប។ គ្មានអក្សរ ឬផ្លូវលួសចូលកែងនោះទេ។',
  'help.h3': 'គ្រាប់ចុច', 'help.b3': 'Ctrl+Z ថយក្រោយ, Ctrl+Y ទៅមុខវិញ, Ctrl+S រក្សាទុក។ លើផ្ទាំង៖ រំកិលកង់កណ្ដុរ ឬច្បិចដើម្បីពង្រីក អូសដើម្បីផ្លាស់ទី Shift+អូស ឬឧបករណ៍ប្រអប់ដើម្បីជ្រើសមួយតំបន់ Shift+ចុចដើម្បីជ្រើសបន្ថែម Ctrl+A ដើម្បីជ្រើសទាំងសន្លឹក។ ពេលកែដោយដៃ៖ ព្រួញរំកិល 1 mm (Shift៖ 10 mm), R បង្វិល 90°, Esc ដកការជ្រើស។',
  'help.h4': 'សុវត្ថិភាព', 'help.b4': 'កម្មវិធីនេះមិនទាន់បានសាកលើម៉ាស៊ីនរបស់អ្នកទេ។ សូមពិនិត្យឯកសារ TAP រាល់ដងក្នុង Mach3 សាកដំណើរការទទេដោយលួសមិនក្ដៅ ហើយនៅជាប់ម៉ាស៊ីន។ លួសក្ដៅ និងផ្សែងស្នោជាការទទួលខុសត្រូវរបស់អ្នកបញ្ជា។',
  'help.h5': 'ទិន្នន័យរបស់អ្នក', 'help.b5': 'ឯកសារត្រូវបានអានក្នុងកម្មវិធីរុករក មិនបញ្ជូនទៅណាទេ។ គម្រោងរក្សាទុកនៅក្នុងឧបករណ៍នេះ។',

  'toast.imported': 'បាននាំចូល {n} ឯកសារ', 'toast.failed': 'មានបញ្ហា៖ {why}', 'toast.noDesigns': 'សូមនាំចូលឯកសារ SVG ជាមុនសិន។', 'toast.unplaced': 'មាន {n} ដុំដាក់មិនបាន។', 'toast.cancelled': 'បានបោះបង់។',
  'toast.saved': 'បានរក្សាទុក {name}', 'toast.confirmFirst': 'សូមកែកំហុសទាំងអស់ ហើយគូសធីកការបញ្ជាក់ជាមុនសិន។', 'toast.projectSaved': 'បានរក្សាទុកគម្រោងក្នុងឧបករណ៍នេះ។', 'toast.restored': 'បានស្ដារគម្រោងវិញ។', 'toast.offline': 'អាចប្រើបានដោយគ្មានអ៊ីនធឺណិតហើយ។',

  'unit.m': 'm', 'unit.minutes': '{m} នាទី', 'unit.hours': '{h} ម៉ោង {m} នាទី', 'unit.cm2': 'cm²',

  'pdf.title': 'របាយការណ៍កាត់', 'pdf.project': 'គម្រោង', 'pdf.date': 'កាលបរិច្ឆេទ', 'pdf.foam': 'ស្នោ', 'pdf.sheets': 'សន្លឹក', 'pdf.pieces': 'ដុំ', 'pdf.utilization': 'ប្រើស្នោ', 'pdf.cut': 'ប្រវែងកាត់',
  'pdf.profile': 'ប្រវត្តិរូបម៉ាស៊ីន', 'pdf.validation': 'លទ្ធផលផ្ទៀងផ្ទាត់', 'pdf.page': 'ទំព័រ {n}', 'pdf.note': 'សូមពិនិត្យឯកសាររាល់ដងនៅលើម៉ាស៊ីនមុនកាត់។ របាយការណ៍នេះមិនធានាសុវត្ថិភាពទេ។',
  'view.tabs': 'ផ្ទាំង', 'view.work': 'ជំហានការងារ', 'view.editor': 'EDITOR',
  'nest.arrange': 'របៀបតម្រៀប', 'nest.arrange.free': 'សន្សំស្នោ', 'nest.arrange.rows': 'ជួរកម្ពស់ដូចគ្នា',
  'nest.rowsHint': 'អក្សរនៅត្រង់ មិនបង្វិលទេ។ អក្សរកម្ពស់ជិតគ្នានៅជួរជាមួយគ្នា ហើយជួរនីមួយៗនៅក្រោមជួរមុន។',
  'nest.tolerance': 'កម្ពស់ខុសគ្នាបាន (mm)', 'nest.align': 'តម្រឹមក្នុងជួរ', 'nest.align.bottom': 'ខាងក្រោម', 'nest.align.top': 'ខាងលើ', 'nest.align.center': 'កណ្ដាល',
  'nest.rowOrder': 'លំដាប់ជួរ', 'nest.rowOrder.height': 'ខ្ពស់មុន', 'nest.rowOrder.file': 'តាមលំដាប់ឯកសារ',
  'nest.fillGaps': 'បំពេញចុងជួរដោយអក្សរទាបជាង', 'nest.tight': 'រៀបជិតតាមរាងអក្សរ',
  'cut.order': 'លំដាប់កាត់', 'cut.order.shortest': 'ផ្លូវខ្លីបំផុត', 'cut.order.rows': 'មួយជួរៗ ពីលើចុះក្រោម', 'cut.order.columns': 'មួយជួរឈរៗ ពីឆ្វេងទៅស្ដាំ', 'cut.order.snake': 'មួយដុំៗ បត់ទៅបត់មក',
  'cut.hint': 'ខ្សែកាត់មួយក្រុមឱ្យចប់ ដើរតាមខ្សែដែលកាត់រួច រួចឆ្លងទៅក្រុមបន្ទាប់។',
  'cut.returnHome': 'ត្រឡប់ទៅចំណុចចាប់ផ្ដើមពេលចប់',
  'cut.noReturn': 'ឯកសារបញ្ចប់នៅក្រុមចុងក្រោយ មិនដើរត្រឡប់ទេ។ ខ្សែនៅជាប់ក្នុងស្នោត្រង់នោះ។',
  'path.openEditor': 'បើកផ្ទាំង EDITOR',
  'editor.empty': 'សូមរៀបស្នោជាមុនសិន ទើបផ្លូវកាត់បង្ហាញនៅទីនេះ។', 'editor.options': 'ជម្រើសកាត់', 'editor.position': 'ទីតាំងខ្សែ',
  'editor.done': 'កាត់រួច', 'editor.left': 'នៅសល់', 'editor.timeLeft': 'ពេលនៅសល់តាម F', 'editor.piece': 'ដុំ', 'editor.move': 'ចលនា', 'editor.retrace': 'លើខ្សែកាត់រួច',
  'editor.prevPiece': 'ដុំមុន', 'editor.nextPiece': 'ដុំបន្ទាប់', 'editor.prevMove': 'ចលនាមុន', 'editor.nextMove': 'ចលនាបន្ទាប់',
  'editor.follow': 'តាមដានខ្សែ', 'editor.manual': 'រើដុំដោយដៃ', 'editor.manualHint': 'អូសដុំនៅលើសន្លឹក ផ្លូវកាត់បង្កើតឡើងវិញដោយខ្លួនឯង។',
  'editor.gcode': 'G-code', 'editor.gcodeHint': 'ចុចបន្ទាត់មួយ ដើម្បីដាក់ខ្សែទៅទីនោះ។',
};

type IssueText = Record<ImportIssueCode, string>;

const importIssues: Record<Lang, IssueText> = {
  en: {
    'invalid-xml': 'The file is damaged and is not valid SVG. Export it again from CorelDRAW.',
    'not-svg': 'This is not an SVG file.', 'file-too-large': 'The file is larger than 20 MB.', 'too-complex': 'The file has too much geometry to handle safely.',
    'recovered-xml': 'The markup had errors but could be read. Check the shapes.', 'empty': 'No shapes to cut were found in this file.',
    'text': 'Text not converted to curves will NOT be cut. Use Convert to Curves.', 'image': 'Images cannot be cut and were skipped.',
    'use-external': 'A symbol points to another file and was skipped.', 'use-cycle': 'A symbol has a broken or circular reference and was skipped.',
    'script': 'Scripts were removed and never run.', 'foreign-object': 'Embedded HTML was skipped.', 'clip-mask': 'Clip paths and masks are not applied: the full shape is used. Use Intersect or Trim instead.',
    'hidden': 'Hidden shapes were skipped.', 'line': 'Single lines have no area and were skipped.', 'open-closed': 'Open outlines were closed with a straight line. Check those shapes.',
    'dropped-open': 'Outlines too short to form a shape were dropped.', 'malformed-path': 'A path has an error. The part before the error was kept.', 'frame': 'A frame around the page was skipped.',
    'bad-length': 'Sizes in percent or unknown units were read as plain numbers. Check dimensions.', 'css-unsupported': 'Some CSS rules could not be read, so fill or visibility may differ.',
    'unknown-element': 'Unknown elements were skipped.', 'tiny': 'Tiny specks under 1 mm² were skipped.', 'duplicates': 'Duplicate shapes were removed so the wire does not cut twice.',
    'overlaps': 'Shapes cross each other. Weld them in CorelDRAW before cutting.', 'marker': 'A small unfilled rectangle was used as the wire start box.'
  },
  km: {
    'invalid-xml': 'ឯកសារខូច មិនមែន SVG ត្រឹមត្រូវទេ។ សូមនាំចេញម្ដងទៀតពី CorelDRAW។',
    'not-svg': 'នេះមិនមែនជាឯកសារ SVG ទេ។', 'file-too-large': 'ឯកសារធំជាង 20 MB។', 'too-complex': 'ឯកសារមានរូបច្រើនពេក មិនអាចដំណើរការដោយសុវត្ថិភាពបានទេ។',
    'recovered-xml': 'ឯកសារមានកំហុស ប៉ុន្តែអានបាន។ សូមពិនិត្យរូប។', 'empty': 'រកមិនឃើញរូបសម្រាប់កាត់ក្នុងឯកសារនេះទេ។',
    'text': 'អក្សរមិនទាន់ Convert to Curves នឹងមិនត្រូវកាត់ទេ។ សូម Convert to Curves។', 'image': 'រូបភាពមិនអាចកាត់បាន ដូច្នេះបានរំលង។',
    'use-external': 'Symbol យោងទៅឯកសារផ្សេង ដូច្នេះបានរំលង។', 'use-cycle': 'Symbol យោងខុស ឬវិលជុំ ដូច្នេះបានរំលង។',
    'script': 'បានដកកូដស្គ្រីបចេញ ហើយមិនដំណើរការវាឡើយ។', 'foreign-object': 'បានរំលង HTML ដែលបង្កប់។', 'clip-mask': 'មិនអនុវត្ត Clip និង Mask ទេ៖ ប្រើរូបពេញ។ សូមប្រើ Intersect ឬ Trim។',
    'hidden': 'បានរំលងរូបដែលលាក់។', 'line': 'ខ្សែបន្ទាត់តែមួយគ្មានផ្ទៃ ដូច្នេះបានរំលង។', 'open-closed': 'បានបិទខ្សែបើកចំហដោយបន្ទាត់ត្រង់។ សូមពិនិត្យរូបនោះ។',
    'dropped-open': 'បានដកខ្សែខ្លីពេកដែលមិនបង្កើតជារូប។', 'malformed-path': 'Path មួយមានកំហុស។ បានរក្សាផ្នែកមុនកំហុស។', 'frame': 'បានរំលងស៊ុមជុំវិញទំព័រ។',
    'bad-length': 'ទំហំជាភាគរយ ឬឯកតាមិនស្គាល់ ត្រូវបានអានជាលេខធម្មតា។ សូមពិនិត្យទំហំ។', 'css-unsupported': 'មិនអាចអាន CSS ខ្លះបាន ដូច្នេះពណ៌ ឬការលាក់អាចខុស។',
    'unknown-element': 'បានរំលងធាតុមិនស្គាល់។', 'tiny': 'បានរំលងចំណុចតូចៗក្រោម 1 mm²។', 'duplicates': 'បានដករូបស្ទួនចេញ ដើម្បីកុំឱ្យលួសកាត់ពីរដង។',
    'overlaps': 'មានរូបកាត់គ្នា។ សូម Weld ក្នុង CorelDRAW មុននឹងកាត់។', 'marker': 'បានប្រើចតុកោណតូចគ្មានពណ៌ជាប្រអប់ចាប់ផ្តើមលួស។'
  }
};

type ValidationText = Record<ValidationCode, string>;

const validationIssues: Record<Lang, ValidationText> = {
  en: {
    'path-empty': 'The cutting path is empty.', 'nan': 'The path contains invalid numbers.', 'out-of-bounds': 'The path leaves the foam sheet.', 'unlinked': 'Contours are not connected to the stroke.',
    'contour-missing': 'Some contour points are not on the cutting path.', 'clamp-collision': 'The wire path enters a clamp zone. The head could hit a clamp.', 'clamp-piece': 'A piece sits in a clamp zone.',
    'start-outside': 'The start point is outside the sheet.', 'start-in-zone': 'The start box is inside a clamp zone.', 'start-mismatch': 'The path does not begin at the start point.', 'path-open': 'The path does not return to its start.',
    'overlap': 'Pieces overlap.', 'gap-violation': 'Pieces are closer than the gap (closest {detail} mm).', 'margin-violation': 'Pieces are inside the edge margin.',
    'bridge-crosses': 'A bridge cuts through another piece.', 'long-bridge': 'A long bridge of {detail} mm joins two areas.', 'profile-feed': 'Feed F must be above zero.', 'profile-power': 'Heat S must be zero or more.',
    'profile-name': 'The machine profile has no name.', 'exceeds-travel': 'The path ({detail}) is larger than the machine travel.', 'tap-format': 'The TAP file failed its format check ({detail}).', 'tap-mismatch': 'The TAP file does not match the preview ({detail}).',
    'unplaced': 'Pieces did not fit on the sheet and are not in this layout.'
  },
  km: {
    'path-empty': 'ផ្លូវកាត់ទទេ។', 'nan': 'ផ្លូវកាត់មានលេខមិនត្រឹមត្រូវ។', 'out-of-bounds': 'ផ្លូវកាត់ចេញក្រៅសន្លឹកស្នោ។', 'unlinked': 'មានខ្សែកាត់មិនភ្ជាប់នឹងផ្លូវលួស។',
    'contour-missing': 'មានចំណុចខ្សែកាត់មិននៅលើផ្លូវលួស។', 'clamp-collision': 'ផ្លូវលួសចូលកែងទុកទំនេរ។ ក្បាលម៉ាស៊ីនអាចបុកឧបករណ៍គៀប។', 'clamp-piece': 'មានដុំស្នោនៅក្នុងកែងទុកទំនេរ។',
    'start-outside': 'ចំណុចចាប់ផ្តើមនៅក្រៅសន្លឹក។', 'start-in-zone': 'ប្រអប់ចាប់ផ្តើមនៅក្នុងកែងទុកទំនេរ។', 'start-mismatch': 'ផ្លូវលួសមិនចាប់ផ្តើមពីចំណុចចាប់ផ្តើម។', 'path-open': 'ផ្លូវលួសមិនត្រឡប់មកចំណុចដើមវិញ។',
    'overlap': 'ដុំស្នោត្រួតគ្នា។', 'gap-violation': 'ដុំស្នោនៅជិតជាងចន្លោះដែលកំណត់ (ជិតបំផុត {detail} mm)។', 'margin-violation': 'ដុំស្នោនៅក្នុងគែមទុក។',
    'bridge-crosses': 'ខ្សែភ្ជាប់កាត់ឆ្លងដុំស្នោផ្សេង។', 'long-bridge': 'មានខ្សែភ្ជាប់វែង {detail} mm រវាងពីរតំបន់។', 'profile-feed': 'ល្បឿន F ត្រូវធំជាងសូន្យ។', 'profile-power': 'កម្តៅ S ត្រូវស្មើសូន្យ ឬធំជាង។',
    'profile-name': 'ប្រវត្តិរូបម៉ាស៊ីនគ្មានឈ្មោះ។', 'exceeds-travel': 'ផ្លូវកាត់ ({detail}) ធំជាងចម្ងាយម៉ាស៊ីន។', 'tap-format': 'ឯកសារ TAP មិនជាប់ការពិនិត្យទម្រង់ ({detail})។', 'tap-mismatch': 'ឯកសារ TAP មិនត្រូវនឹងប្លង់ ({detail})។',
    'unplaced': 'មានដុំស្នោដាក់លើសន្លឹកមិនបាន ហើយមិននៅក្នុងប្លង់នេះទេ។'
  }
};

const dictionaries = { en, km };

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const s = dictionaries[lang][key];
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

export const tr = (key: Key, params?: Record<string, string | number>): string => translate(uiStore.get().lang, key, params);

export function importIssueText(lang: Lang, code: ImportIssueCode): string { return importIssues[lang][code]; }
export function validationText(lang: Lang, code: ValidationCode, detail?: string): string {
  return validationIssues[lang][code].replace('{detail}', detail ?? '');
}

export function useT() {
  const lang = useStore(uiStore, s => s.lang);
  return { lang, t: (key: Key, params?: Record<string, string | number>) => translate(lang, key, params) };
}

export function formatDuration(lang: Lang, minutes: number): string {
  const m = Math.ceil(minutes), h = Math.floor(m / 60);
  return h ? translate(lang, 'unit.hours', { h, m: m % 60 }) : translate(lang, 'unit.minutes', { m });
}

export const allKeys = { en: Object.keys(en), km: Object.keys(km) };
