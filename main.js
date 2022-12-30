import './style.css'
import './chart.css'
import {drawChart} from './chart.js'
import 'gridstack/dist/gridstack.min.css';
import {GridStack} from 'gridstack';

const chartContainer = document.createElement('div');

// dom.textContent = '你好世界';

const items = [
    {el: chartContainer, w: 5, h: 4}, // will default to location (0,0) and 1x1
    // {content:  'my first widget'}, // will default to location (0,0) and 1x1
    // {w: 2, content: 'another longer widget!'} // will be placed next at (1,0) and 2x1
];
const grid = GridStack.init();
grid.load(items);

grid.on('added', function (event, items) {
    console.log('添加完成！');
    items.forEach(function (item) {
        //
    });
});

grid.on('change', function (event, items) {
    items.forEach(function (item) {
        item.el?.drawChart?.();
    });
});

drawChart(chartContainer);


