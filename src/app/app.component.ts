import { OnInit, Component, ElementRef, ViewChild, AfterViewInit, Renderer2 } from '@angular/core';
import { dia, ui, shapes, layout } from '@clientio/rappid';
import * as config from '../app/config/configuration';
import * as _ from 'lodash';

// import * as joint from 'jointjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, AfterViewInit {

  @ViewChild('ToolBarContainer', { static: false, read: '' }) ToolBarContainer: ElementRef;
  @ViewChild('StencilContainer', { static: false, read: '' }) StencilContainer: ElementRef;
  @ViewChild('PaperContainer', { static: false, read: '' }) PaperContainer: ElementRef;
  @ViewChild('InspectorContainer', { static: false, read: '' }) InspectorContainer: ElementRef;
  @ViewChild('NavigatorContainer', { static: false, read: '' }) NavigatorContainer: ElementRef;

  private graph: dia.Graph;
  private commandManager: dia.CommandManager;
  private paper: dia.Paper;
  private snaplines: ui.Snaplines;
  private paperScroller: ui.PaperScroller;
  private stencil: ui.Stencil;
  private keyboard: ui.Keyboard;
  private clipboard: ui.Clipboard;
  private selection: ui.Selection;
  private toolbar: ui.Toolbar;
  private navigator: ui.Navigator;

  constructor(private renderer: Renderer2) {
  }

  public ngOnInit(): void {
    this.initializePaper();
    this.initializeStencil();
    this.initializeSelection();
    this.initializeHaloAndInspector();
    this.initializeNavigator();
    this.initializeToolbar();
    this.initializeKeyboardShortcuts();
    this.initializeTooltips();
  }
  initializePaper() {
    const namespace = shapes;
    const graph = this.graph = new dia.Graph({}, { cellNamespace: shapes });

    graph.on('add', (cell: dia.Cell, collection: any, opt: any) => {
      if (opt.stencil) { this.createInspector(cell); }
    });

    this.commandManager = new dia.CommandManager({ graph: graph });

    const paper = this.paper = new dia.Paper({
      width: 1000,
      height: 1000,
      background: {
        color: '#F8F9FA',
      },
      gridSize: 10,
      drawGrid: true,
      model: graph,
      cellViewNamespace: shapes,
      //   defaultLink: new shapes.app.Link()
    });
    this.keyboard = new ui.Keyboard();
    paper.on('blank:mousewheel', _.partial(this.onMousewheel, null), this);
    paper.on('cell:mousewheel', this.onMousewheel.bind(this));

    this.snaplines = new ui.Snaplines({ paper: paper });

    const paperScroller = this.paperScroller = new ui.PaperScroller({
      paper,
      autoResizePaper: true,
      cursor: 'grab'
    });
    console.log("initializePaper");
    paperScroller.render();

  }
  // Create and populate stencil.
  initializeStencil() {
    const stencil = this.stencil = new ui.Stencil({
      paper: this.paper,
      snaplines: this.snaplines,
      scaleClones: true,
      width: 240,
      groups: config.stencil.groups,
      dropAnimation: true,
      groupsToggleButtons: true,
      search: {
        '*': ['type', 'attrs/text/text', 'attrs/.label/text'],
        'org.Member': ['attrs/.rank/text', 'attrs/.name/text']
      },
      // Use default Grid Layout
      layout: false,
      // Remove tooltip definition from clone
      dragStartClone: (cell: dia.Cell) => cell.clone().removeAttr('./data-tooltip')
    });

    stencil.render();
    stencil.freeze();

    var r = new shapes.basic.Rect({
      position: { x: 10, y: 10 }, size: { width: 50, height: 50 }
    });
    var c = new shapes.basic.Circle({
      position: { x: 10, y: 10 }, size: { width: 50, height: 30 }
    });
    var t = new shapes.basic.Rhombus({
      position: { x: 10, y: 10 }, size: { width: 80, height: 60 }
    });

    stencil.loadGroup([r], 'basic');
    stencil.loadGroup([c], 'fsa');
    stencil.loadGroup([t], 'pn');
  }
  initializeSelection() {
    this.clipboard = new ui.Clipboard();
    this.selection = new ui.Selection({
      paper: this.paper,
      handles: config.selection.handles
    });

    // Initiate selecting when the user grabs the blank area of the paper while the Shift key is pressed.
    // Otherwise, initiate paper pan.
    this.paper.on('blank:pointerdown', (evt: any, x: number, y: number) => {
      if (this.keyboard.isActive('shift', evt)) {
        this.selection.startSelecting(evt);
      } else {
        this.selection.cancelSelection();
        this.paperScroller.startPanning(evt);
      }
    });
    this.paper.on('element:pointerdown', (elementView: dia.ElementView, evt: any) => {

      // Select an element if CTRL/Meta key is pressed while the element is clicked.
      if (this.keyboard.isActive('ctrl meta', evt)) {
        this.selection.collection.add(elementView.model);
      }

    });
    this.selection.on('selection-box:pointerdown', (elementView: dia.ElementView, evt: any) => {
      // Unselect an element if the CTRL/Meta key is pressed while a selected element is clicked.
      if (this.keyboard.isActive('ctrl meta', evt)) {
        this.selection.collection.remove(elementView.model);
      }
    });
  }
  initializeHaloAndInspector() {
    this.paper.on('element:pointerup link:options', (cellView: dia.CellView) => {
      const cell = cellView.model;
      if (!this.selection.collection.contains(cell)) {
        if (cell.isElement()) {
          new ui.FreeTransform({
            cellView,
            allowRotation: false,
            preserveAspectRatio: !!cell.get('preserveAspectRatio'),
            allowOrthogonalResize: cell.get('allowOrthogonalResize') !== false
          }).render();
          new ui.Halo({
            cellView,
            handles: config.halo.handles
          }).render();
          this.selection.collection.reset([]);
          this.selection.collection.add(cell, { silent: true });
        }
        this.createInspector(cell);
      }
    });
  }
  initializeNavigator() {
    const navigator = this.navigator = new ui.Navigator({
      width: 240,
      height: 115,
      paperScroller: this.paperScroller,
      zoom: false
    });
    // $('.navigator-container').append(navigator.el);
    navigator.render();
  }
  initializeToolbar() {

    const toolbar = this.toolbar = new ui.Toolbar({
      groups: config.toolbar.groups,
      tools: config.toolbar.tools,
      references: {
        paperScroller: this.paperScroller,
        commandManager: this.commandManager
      }
    });
    toolbar.on({
      'svg:pointerclick': () => this.openAsSVG(),
      'png:pointerclick': () => this.openAsPNG(),
      'to-front:pointerclick': () => this.selection.collection.invoke('toFront'),
      'to-back:pointerclick': () => this.selection.collection.invoke('toBack'),
      'layout:pointerclick': () => this.layoutDirectedGraph(),
      'snapline:change': (checked: boolean) => this.changeSnapLines(checked),
      'clear:pointerclick': () => this.graph.clear(),
      'print:pointerclick': () => this.paper.print(),
      'grid-size:change': (size: number) => this.paper.setGridSize(size)
    });

    // $('.toolbar-container').append(toolbar.el);
    toolbar.render();
  }
  initializeKeyboardShortcuts() {

    this.keyboard = new ui.Keyboard();
    this.keyboard.on({
      'ctrl+c': () => {

        // Copy all selected elements and their associated links.
        ///this.clipboard.copyElements(this.selection.collection, this.graph);
      },

      'ctrl+v': () => {

        const pastedCells = this.clipboard.pasteCells(this.graph, {
          translate: { dx: 20, dy: 20 },
          useLocalStorage: true
        });

        const elements = _.filter(pastedCells, cell => cell.isElement());

        // Make sure pasted elements get selected immediately. This makes the UX better as
        // the user can immediately manipulate the pasted elements.
        this.selection.collection.reset(elements);
      },

      'ctrl+x shift+delete': () => {
        //  this.clipboard.cutElements(this.selection.collection, this.graph);
      },

      'delete backspace': (evt: JQuery.Event) => {
        evt.preventDefault();
        this.graph.removeCells(this.selection.collection.toArray());
      },

      'ctrl+z': () => {
        this.commandManager.undo();
        this.selection.cancelSelection();
      },

      'ctrl+y': () => {
        this.commandManager.redo();
        this.selection.cancelSelection();
      },

      'ctrl+a': () => {
        this.selection.collection.reset(this.graph.getElements());
      },

      'ctrl+plus': (evt: JQuery.Event) => {
        evt.preventDefault();
        this.paperScroller.zoom(0.2, { max: 5, grid: 0.2 });
      },

      'ctrl+minus': (evt: JQuery.Event) => {
        evt.preventDefault();
        this.paperScroller.zoom(-0.2, { min: 0.2, grid: 0.2 });
      },

      'keydown:shift': (evt: JQuery.Event) => {
        this.paperScroller.setCursor('crosshair');
      },

      'keyup:shift': () => {
        this.paperScroller.setCursor('grab');
      }
    });
  }
  initializeTooltips() {
    // tslint:disable-next-line:no-unused-expression
    new ui.Tooltip({
      rootTarget: document.body,
      target: '[data-tooltip]',
      direction: ui.Tooltip.TooltipArrowPosition.Auto,
      padding: 10
    });
  }
  openAsSVG() {
    this.paper.toSVG((svg: string) => {
      new ui.Lightbox({
        title: '(Right-click, and use "Save As" to save the diagram in SVG format)',
        image: 'data:image/svg+xml,' + encodeURIComponent(svg)
      }).open();
    }, { preserveDimensions: true, convertImagesToDataUris: true });
  }
  openAsPNG() {
    this.paper.toPNG((dataURL: string) => {
      new ui.Lightbox({
        title: '(Right-click, and use "Save As" to save the diagram in PNG format)',
        image: dataURL
      }).open();
    }, { padding: 10 });
  }
  layoutDirectedGraph() {
    layout.DirectedGraph.layout(this.graph, {
      setVertices: true,
      rankDir: 'TB',
      marginX: 100,
      marginY: 100
    });
    this.paperScroller.centerContent();
  }
  changeSnapLines(checked: boolean) {
    if (checked) {
      this.snaplines.startListening();
      this.stencil.options.snaplines = this.snaplines;
    } else {
      this.snaplines.stopListening();
      this.stencil.options.snaplines = null;
    }
  }
  createInspector(cell: dia.Cell) {
    return ui.Inspector.create('.inspector-container', _.extend({ cell }, config.inspector[cell.get('type')]));
  }
  onMousewheel(cellView: dia.CellView, evt: any, ox: number, oy: number, delta: number) {
    if (this.keyboard.isActive('alt', evt)) {
      evt.preventDefault();
      this.paperScroller.zoom(delta * 0.2, { min: 0.2, max: 5, grid: 0.2, ox, oy });
    }
  }
  public ngAfterViewInit(): void {
    const { navigator, toolbar, stencil, paperScroller, paper } = this;
    this.PaperContainer.nativeElement.appendChild(paperScroller.el);
    this.StencilContainer.nativeElement.appendChild(stencil.el);
    this.ToolBarContainer.nativeElement.appendChild(toolbar.el);
    this.NavigatorContainer.nativeElement.appendChild(navigator.el);
    paperScroller.center();
    paper.unfreeze();
    stencil.unfreeze();
    stencil.filter('');
  }
}