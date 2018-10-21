import { Component, Prop, State, Element, Listen, Method, Event, EventEmitter } from '@stencil/core';

@Component({
	tag: 'context-menu',
	styleUrl: 'context-menu.less'
	// shadow: true
})
export class ContextMenu {
	// the element
	@Element() el: HTMLElement;

	/**
	 * Trigger elements be marked using a class name
	 */
	@Prop() triggerClass: string = 'hasContextMenu';

	/**
	 * Overlapping of child <> parent menus in pixel (default `8`)
	 */
	@Prop() horizontalOverlap: number = 8;

	/**
	 * Sets the css attribute z-index to a custom value.
	 * Default is `100` whereas every child increments the value of its parent by one.
	 */
	@Prop({mutable:true}) zIndex: number = 1000000;

	// @Prop({mutable:true}) visible: boolean = false;

	// related menus
	@State() childMenus: Array<HTMLContextMenuElement> = [];
	@State() parentMenu: HTMLContextMenuElement | null = null;
	@State() group: Object = [];
	@State() trigger: HTMLElement;

	/**
	 * Fires when the menu is `open`ed
	 */
	@Event() show: EventEmitter;

	/**
	 * Fires when the menu is `close`d
	 */
	@Event() hide: EventEmitter;

	/**
	 * Fires on `mouse down` of any row with the attribute `data-group`
	 */
	@Event() select: EventEmitter;

	/**
	 * Fires on `mouse down` of any row with the attribute `data-toggle`
	 */
	@Event() toggle: EventEmitter;

	/**
	 * Initialize
	 */
	async componentWillLoad(){
		// acknowledge parent menu
		this.parentMenu = this.el.parentElement.closest('context-menu');

		// is child menu
		if(this.parentMenu){
			// inherit z-index from parent
			this.zIndex = this.parentMenu.zIndex + 1;
		}

		// set z-index
		this.el.style.zIndex = String(this.zIndex);

		// ack trigger
		this.trigger = this.el.parentElement;

		// add class "hasContextMenu" to trigger
		this.trigger.classList.add(this.triggerClass);

		// loop rows
		for(let el of Array.from(this.el.children)){
			// skip dividers
			if(el.tagName === 'HR'){
				continue;
			}

			this.rowHandleGroup(el);
			this.rowHandleToggle(el);

			// detect child menu
			const child = el.querySelector(':scope > context-menu') as HTMLContextMenuElement;

			// handle child menu
			if(child){
				// collect children
				this.childMenus.push(child);

				// mark trigger
				el.classList.add('trigger','sticky');

				// add <aside> to all rows when not present
				if(!el.querySelector(':scope > aside')){
					el.appendChild(document.createElement('aside'));
				}
			}

			// observe mouseover
			el.addEventListener('mouseover', async (ev) => {
				ev.stopPropagation();

				// close children
				this.childMenus.forEach(child => child.close());

				// open current child
				if(child){
					const {top,left} = el.getBoundingClientRect();
					await child.open({top,left});
				}
			});
		}
	}

	/**
	 * Handle row group feature
	 * Rows can be grouped together by using data-group="$groupId"
	 * If an user clicks on a group element a bullet indicates that the row is selected while all other
	 * rows of the group will be unselected
	 */
	private rowHandleGroup(el: Element): void {
		// detect group
		const group = el.getAttribute('data-group');

		// group row found
		if(group){
			// init group array
			if(!this.group[group])
				this.group[group] = [];

			// add to group id
			this.group[group].push(el);

			// avoid menu close on click
			el.classList.add('sticky');

			// observe mouse down
			el.addEventListener('mousedown', (ev) => {
				// remove all
				this.group[group].forEach(el => el.classList.remove('selected'));

				// add to target
				(ev.target as HTMLElement).classList.add('selected');

				// emit
				this.select.emit({
					group,
					el,
					menu: this.el
				});
			})
		}
	}

	/**
	 * Handle row toggle feature
	 * Rows can toggle one of these class names "selected", "checked" "crossed"
	 */
	private rowHandleToggle(el: Element): void {
		// detect toggle
		const toggle = el.getAttribute('data-toggle');

		if(toggle){
			// avoid menu close on click
			el.classList.add('sticky');

			// toggle & emit event on mouse down
			el.addEventListener('mousedown', () =>
				this.toggle.emit({value:el.classList.toggle(toggle),target:el,menu:this.el})
			);
		}
	}

	// /**
	//  * Listen for context menu event to show menu
	//  */
	// @Listen('parent:contextmenu')
	// async parentContextmenu(ev: MouseEvent) {
	// 	ev.preventDefault();
	// 	await this.open({top:ev.clientY,left:ev.clientX});
	// 	return false;
	// }

	/**
	 * Listen for document click to close menu
	 */
	@Listen('document:click')
	async documentClick(ev): Promise<void> {
		if(ev.target.classList.contains('sticky'))
			return null;

		await this.close();
	}

	/**
	 * Extra listener for global context menu in order to close menu when another one is open
	 * @param ev
	 */
	@Listen('document:contextmenu')
	async documentContextmenu(ev){
		// always close at first
		await this.close();

		// make sure there are no other menus having a nearer trigger
		if(!ev.composedPath().reduce((res, el) => {
			if(res === null && el.classList.contains(this.triggerClass)){
				return el === this.trigger;
			}
			return res;
		}, null))
			return null;

		ev.preventDefault();
		await this.open({top:ev.clientY,left:ev.clientX});

		// await this.close();
		return false;
	}

	/**
	 * Opens the menu
	 */
	@Method()
	public async open(pos){
		if(this.el.classList.contains('open'))
			return null;

		// close open menu
		await this.close();

		// show
		this.el.classList.add('open');

		// get viewport size
		const viewport = {
			width: window.innerWidth,
			height: window.innerHeight
		};

		// get menu size
		const size = this.el.getBoundingClientRect();

		// is a child menu
		if(this.parentMenu){
			const sizeParent = this.parentMenu.getBoundingClientRect();
			pos.top -= 4;
			pos.left += sizeParent.width - this.horizontalOverlap;

			pos.top -= viewport.height < pos.top + size.height
				? size.height - 30 : 0;
			pos.left -= viewport.width < pos.left + size.width
				? size.width + sizeParent.width - (this.horizontalOverlap*2) : 0;
		}
		// is god menu
		else {
			pos.top -= viewport.height < pos.top + size.height ? size.height : 0;
			pos.left -= viewport.width < pos.left + size.width ? size.width : 0;
		}

		// apply position
		this.el.style.top = pos.top+'px';
		this.el.style.left = pos.left+'px';

		this.show.emit();
	}

	/**
	 * Closes the menu
	 */
	@Method()
	public async close(){
		if(!this.el.classList.contains('open'))
			return null;

		this.el.classList.remove('open');
		this.childMenus.forEach(child => child.close());
		this.hide.emit();
	}
}