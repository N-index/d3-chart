import './style.css'
import './chart.css'
import {drawChart} from './bar-race-chart.js'
import {drawChart as drawChart1} from './tree-map'
import 'gridstack/dist/gridstack.min.css';
import {GridStack} from 'gridstack';

const gridItem = document.createElement('div');
const gridItemContent = document.createElement('div');
gridItemContent.classList.add('grid-stack-item-content');
gridItem.appendChild(gridItemContent)

const gridItem1 = document.createElement('div');
const gridItemContent1 = document.createElement('div');
gridItemContent1.classList.add('grid-stack-item-content');
gridItem1.appendChild(gridItemContent1);

const items = [
    {el: gridItem, w: 5, h: 3}, // will default to location (0,0) and 1x1
    {el: gridItem1, w: 8, h: 4}, // will default to location (0,0) and 1x1
];
const grid = GridStack.init({
    minRow: 8,
    float: true,
    margin: 5,
    resizable: {handles: 'all'},
    alwaysShowResizeHandle: false
});
grid.load(items);

grid.on('added', function (event, items) {
    console.log('添加完成！');
    items.forEach(function (item) {
        //
    });
});

grid.on('change', function (event, items) {
    items.forEach(function (item) {
        console.log(item);
        item.el && item.el.querySelector('.grid-stack-item-content')?.drawChart?.();
    });
});

drawChart(gridItemContent);
drawChart1(gridItemContent1);


