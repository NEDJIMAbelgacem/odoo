import { Component, reactive, useRef, useState, xml } from "@odoo/owl";
import { useNestedSortable } from "@web/core/utils/nested_sortable";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { drag, queryFirst } from "@odoo/hoot-dom";
import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";

/**
 * Dragging methods taking into account the fact that it's the top of the
 * dragged element that triggers the moves (not the position of the cursor),
 * and the fact that during the first move, the dragged element is replaced by
 * a placeholder that does not have the same height. The moves are done with
 * the same x position to prevent triggering horizontal moves.
 * @param {string} from
 */
const sortableDrag = (from) => {
    const fromEl = queryFirst(from);
    const fromRect = fromEl.getBoundingClientRect();
    const { drop, moveTo } = drag(from);

    let isFirstMove = true;

    /**
     * @param {string} [targetSelector]
     */
    const moveAbove = (targetSelector) => {
        const el = queryFirst(targetSelector);
        moveTo(el, {
            position: {
                x: fromRect.x - el.getBoundingClientRect().x + fromRect.width / 2,
                y: fromRect.height / 2 + 5,
            },
            relative: true,
        });
        isFirstMove = false;
    };

    /**
     * @param {string} [targetSelector]
     */
    const moveUnder = (targetSelector) => {
        const el = queryFirst(targetSelector);
        const elRect = el.getBoundingClientRect();
        let firstMoveBelow = false;
        if (isFirstMove && elRect.y > fromRect.y) {
            // Need to consider that the moved element will be replaced by a
            // placeholder with a height of 5px
            firstMoveBelow = true;
        }
        moveTo(el, {
            position: {
                x: fromRect.x - elRect.x + fromRect.width / 2,
                y:
                    ((firstMoveBelow ? -1 : 1) * fromRect.height) / 2 +
                    elRect.height +
                    (firstMoveBelow ? 4 : -1),
            },
            relative: true,
        });
        isFirstMove = false;
    };
    return { moveAbove, moveUnder, drop };
};

const dragAndDrop = async (from, to) => {
    const { drop, moveUnder } = sortableDrag(from);
    moveUnder(to);
    await animationFrame();
    drop();
};

test("Parameters error handling", async () => {
    const mountNestedSortableAndAssert = async (setupList) => {
        class NestedSortable extends Component {
            static props = ["*"];
            static template = xml`
                    <div t-ref="root">
                        <ul class="sortable_list">
                            <li t-foreach="[1,2,3]" t-as="i" t-key="i" class="item">
                                <span t-out="i"/>
                                <ul class="sub_list">
                                    <li t-foreach="[1,2,3]" t-as="j" t-key="j" class="item">
                                        <span t-out="j"/>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                `;

            setup() {
                setupList();
            }
        }

        await mountWithCleanup(NestedSortable);
    };

    // Incorrect params
    await mountNestedSortableAndAssert(() => {
        expect(() => useNestedSortable({})).toThrow(
            `Error in hook useNestedSortable: missing required property "ref" in parameter`
        );
    });
    await mountNestedSortableAndAssert(() => {
        expect(() =>
            useNestedSortable({
                elements: ".item",
                groups: ".list",
            })
        ).toThrow(`Error in hook useNestedSortable: missing required property "ref" in parameter`);
    });

    // Correct params
    await mountNestedSortableAndAssert(() => {
        useNestedSortable({
            ref: useRef("root"),
        });
    });
    await mountNestedSortableAndAssert(() => {
        useNestedSortable({
            ref: {},
            elements: ".item",
            groups: ".list",
            enable: false,
        });
    });
    await mountNestedSortableAndAssert(() => {
        useNestedSortable({
            ref: useRef("root"),
            groups: ".list",
            connectGroups: true,
            nest: true,
            listTagName: "ol",
            nestIndent: 20,
        });
    });
});

test("Sorting in a single group without nesting", async () => {
    expect.assertions(30);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li t-foreach="[1, 2, 3]" t-as="i" t-key="i" class="item" t-att-id="i">
                            <span t-out="i"/>
                            <ul class="sub_list">
                                <li t-foreach="[1, 2]" t-as="j" t-key="j" class="item" t-attf-id="{i},{j}">
                                    <span t-out="i + '.' + j"/>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".sortable_list > li",
                onDragStart({ element, group }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "1");
                    expect(group).toBe(undefined);
                },
                onMove({ element, previous, next, parent, group, newGroup, prevPos, placeholder }) {
                    expect.step("move");
                    expect(element).toHaveAttribute("id", "1");
                    expect(previous).toHaveAttribute("id", "2");
                    expect(next).toHaveAttribute("id", "3");
                    expect(parent).toBe(false);
                    expect(group).toBe(undefined);
                    expect(newGroup).toBe(undefined);
                    expect(prevPos.previous).toHaveAttribute("id", "1");
                    expect(prevPos.next).toHaveAttribute("id", "2");
                    expect(prevPos.parent).toBe(null);
                    expect(prevPos.group).toBe(false);
                    expect(placeholder.previousElementSibling).toHaveAttribute("id", "2");
                },
                onDrop({ element, previous, next, parent, group, newGroup, placeholder }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "1");
                    expect(previous).toHaveAttribute("id", "2");
                    expect(next).toHaveAttribute("id", "3");
                    expect(parent).toBe(null);
                    expect(group).toBe(undefined);
                    expect(newGroup).toBe(null);
                    expect(placeholder.previousElementSibling).toHaveAttribute("id", "2");
                },
                onDragEnd({ element, group }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "1");
                    expect(group).toBe(undefined);
                    expect(".sortable_list > .item").toHaveCount(4);
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    expect(".sortable_list > .item").toHaveCount(3);
    expect(".o_dragged").toHaveCount(0);
    expect([]).toVerifySteps();

    // Move first item after second item
    const { drop, moveUnder } = sortableDrag(".sortable_list > .item:first-child");
    moveUnder(".sortable_list > .item:nth-child(2)");
    await animationFrame();
    expect(queryFirst(".sortable_list > .item")).toHaveClass("o_dragged");

    drop();
    expect(".sortable_list > .item").toHaveCount(3);
    expect(".o_dragged").toHaveCount(0);
    expect(["start", "move", "drop", "end"]).toVerifySteps();
});

test("Sorting in groups without nesting", async () => {
    expect.assertions(32);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <section t-foreach="[1,2,3]" t-as="l" t-key="l" t-att-id="l" class="pb-1">
                        <ul class="sortable_list">
                            <li t-foreach="[1,2]" t-as="i" t-key="i" t-attf-class="item #{l}.#{i}" t-attf-id="#{l}.#{i}">
                                <span t-out="l + '.' + i"/>
                                <ul class="sub_list">
                                    <li t-foreach="[1,2]" t-as="j" t-key="j" t-attf-class="item #{l}.#{i}.#{j}" t-attf-id="#{l}.#{i}.#{j}">
                                        <span t-out="l + '.' + i + '.' + j"/>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </section>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".sortable_list > li",
                groups: "section",
                connectGroups: true,
                onDragStart({ element, group }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "2.2");
                    expect(group).toHaveAttribute("id", "2");
                },
                onMove({ element, previous, next, parent, group, newGroup, prevPos, placeholder }) {
                    expect.step("move");
                    expect(element).toHaveAttribute("id", "2.2");
                    expect(previous).toHaveAttribute("id", "1.2");
                    expect(next).toBe(null);
                    expect(parent).toBe(false);
                    expect(group).toHaveAttribute("id", "2");
                    expect(newGroup).toHaveAttribute("id", "1");
                    expect(prevPos.previous).toHaveAttribute("id", "2.2");
                    expect(prevPos.next).toBe(null);
                    expect(prevPos.parent).toBe(null);
                    expect(prevPos.group).toHaveAttribute("id", "2");
                    expect(placeholder.previousElementSibling).toHaveAttribute("id", "1.2");
                },
                onGroupEnter({ placeholder, group }) {
                    expect.step("enter");
                    expect(placeholder).toHaveClass("2.2");
                    expect(group).toHaveAttribute("id", "1");
                },
                onGroupLeave({ placeholder, group }) {
                    expect.step("leave");
                    expect(placeholder).toHaveClass("2.2");
                    expect(group).toHaveAttribute("id", "2");
                },
                onDrop({ element, previous, next, parent, group, newGroup, placeholder }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "2.2");
                    expect(previous).toHaveAttribute("id", "1.2");
                    expect(next).toBe(null);
                    expect(parent).toBe(null);
                    expect(group).toHaveAttribute("id", "2");
                    expect(newGroup).toHaveAttribute("id", "1");
                    expect(placeholder.previousElementSibling).toHaveAttribute("id", "1.2");
                },
                onDragEnd({ element, group }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "2.2");
                    expect(group).toHaveAttribute("id", "2");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);
    await animationFrame();

    expect(".sortable_list").toHaveCount(3);
    expect(".item").toHaveCount(18);
    expect([]).toVerifySteps();
    // Append second item of second list to first list
    await dragAndDrop("section:nth-child(2) > ul > .item:nth-child(2)", "section:first-child");

    expect(".sortable_list").toHaveCount(3);
    expect(".item").toHaveCount(18);
    expect(["start", "move", "enter", "leave", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move right", async () => {
    expect.assertions(24);
    let firstMove = true;
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li t-foreach="[1,2,3]" t-as="i" t-key="i" class="item" t-att-id="i">
                            <span t-out="i"/>
                            <ul class="sub_list">
                                <li t-attf-id="sub#{i}" class="item">
                                    <span t-out="'sub' + i"/>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "2");
                    firstMove = true;
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    if (firstMove) {
                        expect.step("move 1");
                        expect(element).toHaveAttribute("id", "2");
                        expect(previous).toHaveAttribute("id", "sub1");
                        expect(next).toBe(null);
                        expect(parent).toHaveAttribute("id", "1");
                        expect(prevPos.previous).toHaveAttribute("id", "2");
                        expect(prevPos.next).toHaveAttribute("id", "3");
                        expect(prevPos.parent).toBe(null);
                        firstMove = false;
                    } else {
                        expect.step("move 2");
                        expect(element).toHaveAttribute("id", "2");
                        expect(previous).toBe(null);
                        expect(next).toBe(null);
                        expect(parent).toHaveAttribute("id", "sub1");
                        expect(prevPos.previous).toHaveAttribute("id", "sub1");
                        expect(prevPos.next).toBe(null);
                        expect(prevPos.parent).toHaveAttribute("id", "1");
                    }
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "2");
                    expect(previous).toBe(null);
                    expect(next).toBe(null);
                    expect(parent).toHaveAttribute("id", "sub1");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "2");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    expect(".item").toHaveCount(6);
    expect([]).toVerifySteps();

    const movedEl = queryFirst(".sortable_list > .item:nth-child(2)");
    const { drop, moveTo } = drag(movedEl);
    moveTo(movedEl, {
        position: {
            x: movedEl.getBoundingClientRect().width / 2 + 15,
        },
        relative: true,
    });
    await animationFrame();
    moveTo(movedEl, {
        position: {
            x: movedEl.getBoundingClientRect().width / 2 + 30,
        },
        relative: true,
    });
    await animationFrame();
    // No move if row is already child
    drop(movedEl, {
        position: {
            x: movedEl.getBoundingClientRect().width / 2 + 45,
        },
        relative: true,
    });
    await animationFrame();
    expect(".item").toHaveCount(6);
    expect(["start", "move 1", "move 2", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move left", async () => {
    expect.assertions(17);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li class="item" id="parent">
                            <span>parent</span>
                            <ul>
                                <li class="item" id="sub1">
                                    <span>sub1</span>
                                    <ul>
                                        <li class="item" id="dragged">
                                            <span>dragged</span>
                                        </li>
                                    </ul>
                                </li>
                                <li class="item" id="sub2">
                                    <span>sub2</span>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                nestInterval: 20,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "dragged");
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    expect.step("move");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toHaveAttribute("id", "sub1");
                    expect(next).toHaveAttribute("id", "sub2");
                    expect(parent).toHaveAttribute("id", "parent");
                    expect(prevPos.previous).toHaveAttribute("id", "dragged");
                    expect(prevPos.next).toBe(null);
                    expect(prevPos.parent).toHaveAttribute("id", "sub1");
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toHaveAttribute("id", "sub1");
                    expect(next).toHaveAttribute("id", "sub2");
                    expect(parent).toHaveAttribute("id", "parent");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    expect(".item").toHaveCount(4);
    expect([]).toVerifySteps();

    const movedEl = queryFirst(".item#dragged");
    const { drop, moveTo } = drag(movedEl);
    // No move if distance traveled is smaller than the nest interval
    let boundingClientRect = movedEl.getBoundingClientRect();
    moveTo(movedEl, {
        position: {
            x: boundingClientRect.width / 2 - 10,
        },
    });
    await animationFrame();
    boundingClientRect = movedEl.getBoundingClientRect();
    moveTo(movedEl, {
        position: {
            x: boundingClientRect.width / 2 - 20,
        },
    });
    await animationFrame();
    // No move if there is one element before and one after
    boundingClientRect = movedEl.getBoundingClientRect();
    drop(movedEl, {
        position: {
            x: boundingClientRect.width / 2 - 40,
        },
    });
    await animationFrame();

    expect(".item").toHaveCount(4);
    expect(["start", "move", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move root down", async () => {
    expect.assertions(23);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li class="item" id="dragged">
                            <span>dragged</span>
                        </li>
                        <li class="item" id="noChild">
                            <span>noChild</span>
                        </li>
                        <li class="item" id="parent">
                            <span>parent</span>
                            <ul>
                                <li class="item" id="child">
                                    <span>item</span>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "dragged");
                    this.firstMove = true;
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    if (this.firstMove) {
                        expect.step("move 1");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toHaveAttribute("id", "noChild");
                        expect(next).toHaveAttribute("id", "parent");
                        expect(parent).toBe(null);
                        expect(prevPos.previous).toHaveAttribute("id", "dragged");
                        expect(prevPos.next).toHaveAttribute("id", "noChild");
                        expect(prevPos.parent).toBe(null);
                        this.firstMove = false;
                    } else {
                        expect.step("move 2");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toBe(null);
                        expect(next).toHaveAttribute("id", "child");
                        expect(parent).toHaveAttribute("id", "parent");
                        expect(prevPos.previous).toHaveAttribute("id", "noChild");
                        expect(prevPos.next).toHaveAttribute("id", "parent");
                        expect(prevPos.parent).toBe(null);
                    }
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toBe(null);
                    expect(next).toHaveAttribute("id", "child");
                    expect(parent).toHaveAttribute("id", "parent");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);
    expect([]).toVerifySteps();

    const { drop, moveUnder } = sortableDrag(".item#dragged");
    moveUnder(".item#noChild");
    await animationFrame();
    // Move under the content of the row, not under the rows nested inside the row
    moveUnder(".item#parent > span");
    await animationFrame();
    drop();

    expect(".item").toHaveCount(4);
    expect(["start", "move 1", "move 2", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move child down", async () => {
    expect.assertions(23);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li class="item" id="parent">
                            <span>parent</span>
                            <ul>
                                <li class="item" id="dragged">
                                    <span>dragged</span>
                                </li>
                                <li class="item" id="child">
                                    <span>item</span>
                                </li>
                            </ul>
                        </li>
                        <li class="item" id="noChild">
                            <span>noChild</span>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "dragged");
                    this.firstMove = true;
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    if (this.firstMove) {
                        expect.step("move 1");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toHaveAttribute("id", "child");
                        expect(next).toBe(null);
                        expect(parent).toHaveAttribute("id", "parent");
                        expect(prevPos.previous).toHaveAttribute("id", "dragged");
                        expect(prevPos.next).toHaveAttribute("id", "child");
                        expect(prevPos.parent).toHaveAttribute("id", "parent");
                        this.firstMove = false;
                    } else {
                        expect.step("move 2");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toHaveAttribute("id", "noChild");
                        expect(next).toBe(null);
                        expect(parent).toBe(null);
                        expect(prevPos.previous).toHaveAttribute("id", "child");
                        expect(prevPos.next).toBe(null);
                        expect(prevPos.parent).toHaveAttribute("id", "parent");
                    }
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toHaveAttribute("id", "noChild");
                    expect(next).toBe(null);
                    expect(parent).toBe(null);
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                },
            });
        }
    }
    await mountWithCleanup(NestedSortable);
    expect([]).toVerifySteps();

    const { drop, moveUnder } = sortableDrag(".item#dragged");
    moveUnder(".item#child");
    await animationFrame();
    moveUnder(".item#noChild");
    await animationFrame();
    drop();

    expect(".item").toHaveCount(4);
    expect(["start", "move 1", "move 2", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move root up", async () => {
    expect.assertions(23);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li class="item" id="parent">
                            <span>parent</span>
                            <ul>
                                <li class="item" id="child">
                                    <span>child</span>
                                </li>
                            </ul>
                        </li>
                        <li class="item" id="noChild">
                            <span>noChild</span>
                        </li>
                        <li class="item" id="dragged">
                            <span>dragged</span>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "dragged");
                    this.firstMove = true;
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    if (this.firstMove) {
                        expect.step("move 1");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toHaveAttribute("id", "parent");
                        expect(next).toHaveAttribute("id", "noChild");
                        expect(parent).toBe(null);
                        expect(prevPos.previous).toHaveAttribute("id", "dragged");
                        expect(prevPos.next).toBe(null);
                        expect(prevPos.parent).toBe(null);
                        this.firstMove = false;
                    } else {
                        expect.step("move 2");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toBe(null);
                        expect(next).toHaveAttribute("id", "child");
                        expect(parent).toHaveAttribute("id", "parent");
                        expect(prevPos.previous).toHaveAttribute("id", "parent");
                        expect(prevPos.next).toHaveAttribute("id", "noChild");
                        expect(prevPos.parent).toBe(null);
                    }
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toBe(null);
                    expect(next).toHaveAttribute("id", "child");
                    expect(parent).toHaveAttribute("id", "parent");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);
    expect([]).toVerifySteps();

    const { drop, moveAbove } = sortableDrag(".item#dragged");
    moveAbove(".item#noChild");
    await animationFrame();
    moveAbove(".item#child");
    await animationFrame();
    drop();

    expect(".item").toHaveCount(4);
    expect(["start", "move 1", "move 2", "drop", "end"]).toVerifySteps();
});

test("Sorting with nesting - move child up", async () => {
    expect.assertions(23);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root">
                    <ul class="sortable_list">
                        <li class="item" id="parent">
                            <span>parent</span>
                            <ul>
                                <li class="item" id="child">
                                    <span>child</span>
                                </li>
                                <li class="item" id="dragged">
                                    <span>dragged</span>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                onDragStart({ element }) {
                    expect.step("start");
                    expect(element).toHaveAttribute("id", "dragged");
                    this.firstMove = true;
                },
                onMove({ element, previous, next, parent, prevPos }) {
                    if (this.firstMove) {
                        expect.step("move 1");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toBe(null);
                        expect(next).toHaveAttribute("id", "child");
                        expect(parent).toHaveAttribute("id", "parent");
                        expect(prevPos.previous).toHaveAttribute("id", "dragged");
                        expect(prevPos.next).toBe(null);
                        expect(prevPos.parent).toHaveAttribute("id", "parent");
                        this.firstMove = false;
                    } else {
                        expect.step("move 2");
                        expect(element).toHaveAttribute("id", "dragged");
                        expect(previous).toBe(null);
                        expect(next).toHaveAttribute("id", "parent");
                        expect(parent).toBe(null);
                        expect(prevPos.previous).toBe(null);
                        expect(prevPos.next).toHaveAttribute("id", "child");
                        expect(prevPos.parent).toHaveAttribute("id", "parent");
                    }
                },
                onDrop({ element, previous, next, parent }) {
                    expect.step("drop");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(previous).toBe(null);
                    expect(next).toHaveAttribute("id", "parent");
                    expect(parent).toBe(null);
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);
    expect([]).toVerifySteps();

    const { drop, moveAbove } = sortableDrag(".item#dragged");
    moveAbove(".item#child");
    await animationFrame();
    moveAbove(".item#parent");
    await animationFrame();
    drop();

    expect(".item").toHaveCount(3);
    expect(["start", "move 1", "move 2", "drop", "end"]).toVerifySteps();
});

test("Dynamically disable NestedSortable feature", async () => {
    expect.assertions(3);

    const state = reactive({ enableNestedSortable: true });
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                <div t-ref="root" class="root">
                    <ul class="list">
                        <li t-foreach="[1, 2, 3]" t-as="i" t-key="i" t-esc="i" class="item" />
                    </ul>
                </div>
            `;

        setup() {
            this.state = useState(state);
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                enable: () => this.state.enableNestedSortable,
                onDragStart() {
                    expect.step("start");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    expect([]).toVerifySteps();

    await dragAndDrop(".item:first-child", ".item:last-child");
    // Drag should have occurred
    expect(["start"]).toVerifySteps();

    state.enableNestedSortable = false;
    await animationFrame();

    await dragAndDrop(".item:first-child", ".item:last-child");

    // Drag shouldn't have occurred
    expect([]).toVerifySteps();
});

test("Drag has a default tolerance of 10 pixels before initiating the dragging", async () => {
    expect.assertions(2);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
                    <div t-ref="root" class="root">
                        <ul class="list">
                            <li t-foreach="[1, 2, 3]" t-as="i" t-key="i" t-esc="i" class="item" />
                        </ul>
                    </div>
                `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                onDragStart() {
                    expect.step("Initiation of the drag sequence");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    // Move the element from only 5 pixels
    const listItem = queryFirst(".item:first-child");
    const { drop, moveTo } = drag(listItem);
    moveTo(listItem, {
        position: {
            x: listItem.getBoundingClientRect().width / 2,
            y: listItem.getBoundingClientRect().height / 2 + 5,
        },
        relative: true,
    });
    await animationFrame();
    expect([]).toVerifySteps({ message: "No drag sequence should have been initiated" });
    // Move the element from more than 10 pixels
    moveTo(listItem, {
        position: {
            x: listItem.getBoundingClientRect().width / 2,
            y: listItem.getBoundingClientRect().height / 2 + 10,
        },
        relative: true,
    });
    await animationFrame();
    expect(["Initiation of the drag sequence"]).toVerifySteps({
        message: "A drag sequence should have been initiated",
    });
    drop();
});

test("shouldn't drag above max level", async () => {
    expect.assertions(4);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
            <div t-ref="root" class="root">
                <ul class="list">
                    <li class="item" id="parent">
                        <span>parent</span>
                    </li>
                    <li class="item" id="dragged">
                        <span>dragged</span>
                        <ul>
                            <li class="item" id="child">
                                <span>child</span>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                nest: true,
                maxLevels: 2,
                onDragStart() {
                    expect.step("start");
                },
                onMove() {
                    expect.step("move");
                },
                onDrop() {
                    expect.step("drop");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(element.parentElement.closest("#parent")).toBe(null);
                    expect(".o_nested_sortable_placeholder.d-none").toHaveCount(1);
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    // cant move draggable under parent
    const draggedNode = queryFirst(".item#dragged");
    const { drop, moveTo } = drag(draggedNode);
    moveTo("#parent", { position: "right" });
    await animationFrame();
    drop();
    expect(["start", "end"]).toVerifySteps();
});

test("shouldn't drag outside a nest level", async () => {
    expect.assertions(8);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
            <div t-ref="root" class="root">
                <ul class="list">
                    <li class="item" id="A">
                        <span>A</span>
                    </li>
                    <li class="item" id="B">
                        <span>B</span>
                        <ul>
                            <li class="item" id="C">
                                <span>C</span>
                            </li>
                            <li class="item" id="D">
                                <span>D</span>
                            </li>
                            <li class="item" id="E">
                                <span>E</span>
                                <ul>
                                    <li class="item" id="F">
                                        <span>F</span>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                onDragStart() {
                    expect.step("start");
                },
                onMove() {
                    expect.step("move");
                },
                onDrop() {
                    expect.step("drop");
                },
                onDragEnd({ element }) {
                    expect.step("end");
                    const placeholder = queryFirst(".o_nested_sortable_placeholder");
                    if (element.id === "D1") {
                        expect(placeholder.nextElementSibling).toHaveAttribute("id", "C");
                    } else if (element.id === "D2") {
                        expect(placeholder.previousElementSibling).toHaveAttribute("id", "E");
                    } else if (element.id === "D3") {
                        expect(placeholder.previousElementSibling).toHaveAttribute("id", "D3");
                    } else if (element.id === "D4") {
                        expect(placeholder.previousElementSibling).toHaveAttribute("id", "D4");
                    }
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    const dragged = queryFirst("#D");
    let drop, moveAbove, moveUnder;
    // Move before a sibling (success)
    dragged.id = "D1";
    ({ drop, moveAbove } = sortableDrag("#D1"));
    moveAbove("#C > span");
    await animationFrame();
    drop();
    expect(["start", "move", "drop", "end"]).toVerifySteps();
    // Move after a sibling (success)
    dragged.id = "D2";
    ({ drop, moveUnder } = sortableDrag("#D2"));
    moveUnder("#E > span");
    await animationFrame();
    drop();
    expect(["start", "move", "drop", "end"]).toVerifySteps();
    // Attempt to change parent by going above the current parent (fail)
    dragged.id = "D3";
    ({ drop, moveAbove } = sortableDrag("#D3"));
    moveAbove("#B > span");
    await animationFrame();
    drop();
    expect(["start", "end"]).toVerifySteps();
    // Attempt to change parent by becoming the child of a sibling (fail)
    dragged.id = "D4";
    ({ drop, moveUnder } = sortableDrag("#D4"));
    moveUnder("#F > span");
    await animationFrame();
    drop();
    expect(["start", "end"]).toVerifySteps();
});

test("shouldn't drag when not allowed", async () => {
    expect.assertions(3);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
            <div t-ref="root" class="root">
                <ul class="list">
                    <li class="item" id="target">
                        <span>item</span>
                    </li>
                    <li class="item" id="dragged">
                        <span>dragged</span>
                    </li>
                </ul>
            </div>
        `;

        setup() {
            let firstAllowedCheck = true;
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                isAllowed() {
                    expect.step("allowed_check");
                    if (firstAllowedCheck) {
                        // 1st check is used by internal nested_sortable hooks "onMove"
                        firstAllowedCheck = false;
                        expect(".o_nested_sortable_placeholder.d-none").toHaveCount(0);
                    } else {
                        // 2e check is used by internal nested_sortable hooks "onDrop"
                        expect(".o_nested_sortable_placeholder.d-none").toHaveCount(1);
                    }
                    return false;
                },
                onDragStart() {
                    expect.step("start");
                },
                onMove() {
                    expect.step("move");
                },
                onDrop() {
                    expect.step("drop");
                },
                onDragEnd() {
                    expect.step("end");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    const draggedNode = queryFirst(".item#dragged");
    const { drop, moveTo } = drag(draggedNode);
    moveTo("#target", { position: "right" });
    await animationFrame();
    drop();
    expect(["start", "allowed_check", "allowed_check", "end"]).toVerifySteps();
});

test("placeholder and drag element have same size", async () => {
    expect.assertions(5);
    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
            <div t-ref="root" class="root">
                <ul class="list">
                    <li class="item target" id="target">
                        <span>parent</span>
                    </li>
                    <li class="item dragged" id="dragged">
                        <span>dragged</span>
                    </li>
                </ul>
            </div>
        `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                useElementSize: true,
                onDrop({ element, placeholder }) {
                    expect(element).toHaveAttribute("id", "dragged");
                    expect(placeholder).toHaveClass("dragged");
                    expect(placeholder).toHaveClass("o_nested_sortable_placeholder_realsize");
                    expect(placeholder).not.toHaveClass("o_nested_sortable_placeholder");
                    expect(element.getBoundingClientRect().height).toBe(
                        placeholder.getBoundingClientRect().height
                    );
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    const draggedNode = queryFirst(".item#dragged");
    const { drop, moveTo } = drag(draggedNode);
    moveTo("#target", { position: "right" });
    await animationFrame();
    drop();
});

test("Ignore specified elements", async () => {
    expect.assertions(4);

    class NestedSortable extends Component {
        static props = ["*"];
        static template = xml`
            <div t-ref="root" class="root">
                <ul class="list">
                    <li t-foreach="[1, 2, 3]" t-as="i" t-key="i" class="item">
                        <span class="ignored" t-esc="i" />
                        <span class="not-ignored" t-esc="i" />
                    </li>
                </ul>
            </div>
        `;

        setup() {
            useNestedSortable({
                ref: useRef("root"),
                elements: ".item",
                ignore: ".ignored",
                onDragStart() {
                    expect.step("drag");
                },
            });
        }
    }

    await mountWithCleanup(NestedSortable);

    expect([]).toVerifySteps();
    // Drag root item element
    await dragAndDrop(".item:first-child", ".item:nth-child(2)");
    expect(["drag"]).toVerifySteps();
    // Drag ignored element
    await dragAndDrop(".item:first-child .not-ignored", ".item:nth-child(2)");
    expect(["drag"]).toVerifySteps();
    // Drag non-ignored element
    await dragAndDrop(".item:first-child .ignored", ".item:nth-child(2)");
    expect([]).toVerifySteps();
});
