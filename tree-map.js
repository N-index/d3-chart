import * as d3 from './src/utils/d3';


export const drawChart = async (container) => {
    console.log('---draw tree map---');
    if (!container) {
        console.log('无绘图容器');
        return
    }
    container.drawChart = () => {
        // 移除上一次绘图的残留
        d3.select(container).select('svg').remove();
        drawChart(container);
    }

    const dimensions = {
        width: container.offsetWidth,
        height: container.offsetHeight,
        margin: {
            top: 30,
            right: 30,
            bottom: 30,
            left: 30
        }
    };
    dimensions.boundWidth = dimensions.width - dimensions.margin.left - dimensions.margin.right;
    dimensions.boundHeight = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;


    const svg = d3.select(container)
        .append('svg')
        .attr('width', dimensions.width)
        .attr('height', dimensions.height)
        .append('g')
        .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);


    // 绘制地区下各省的销售金额

    const orderDateAccessor = d => d[0]; // 销售日期
    const sellAmount = d => d[10]; // 销售数量

    const areaAccessor = d => d[4]; // 区域
    const provinceAccessor = d => d[5]; // 省份
    const sellMoneyAccessor = d => d[11]; // 销售金额

    const [header, ...body] = await fetchData();


    // 1. 根据时间（以月为单位）分组 (group)  2. 根据区域分组(rollup)

    const monthStartAccessor = row => d3.timeMonth.floor(orderDateAccessor(row));

    // 区域的集合
    const areaMap = new Map();
    const timeGroupMap = new Map();
    const timeGroupInternMap = new Map();
    timeGroupMap['_internMap'] = timeGroupInternMap; // 暂时不需要
    for (const row of body) {
        const dateObj = monthStartAccessor(row);
        const dateTime = dateObj.getTime();
        if (!timeGroupInternMap.has(dateTime)) {
            timeGroupInternMap.set(dateTime, dateObj);

            const timeGroupSummary = {
                maxCumSumAreaName: '',
                maxCumSumValue: Number.NEGATIVE_INFINITY
            };
            timeGroupMap.set(dateObj, {
                summary: timeGroupSummary,
                areaGroupMap: new Map(),
                sortedAreaGroup: []
            });
        }
        const matchedTimeGroup = timeGroupMap.get(timeGroupInternMap.get(dateTime));
        const areaGroupMap = matchedTimeGroup.areaGroupMap;
        const curAreaName = areaAccessor(row);
        if (!areaGroupMap.has(curAreaName)) {
            areaGroupMap.set(curAreaName, {
                summary: {sum: 0, cumSum: 0, rank: -1},
                group: []
            })
        }
        const matchedAreaGroup = areaGroupMap.get(curAreaName);
        matchedAreaGroup.group.push(row);
        const [curAreaSummary, curAreaGroup] = [matchedAreaGroup.summary, matchedAreaGroup.group];

        // 在分组的过程中可以计算sum,但如果在此处用的话：
        // 1. sum没有d3的sum好用，可能会遇到非数字。
        // 2. cumSum一定是要在分组完成之后再做的，所以 计算sum和cumSum的逻辑东一个西一个的不太好
        // 所以比较好的方法是留在分组完成后，统一计算包括sum在内的统计信息。
        // curAreaSummary.sum += sellMoneyAccessor(row);
    }

    // 2. 对时间片进行排序。便于计算统计信息（累加），便于绘图
    const sortedTimeGroup = [...timeGroupMap.entries()].sort(([timeA], [timeB]) => d3.ascending(timeA, timeB));


    // 2. 分组完成之后，计算统计信息
    sortedTimeGroup.forEach(([time, timeGroup], keyframeIndex) => {
        const {summary: timeGroupSummary, areaGroupMap} = timeGroup;
        areaGroupMap.forEach((areaDetail, areaName) => {
            const {group, summary: areaSummary} = areaDetail;
            areaSummary.sum = d3.sum(group, sellMoneyAccessor);

            if (keyframeIndex === 0) { // 如果是第一帧
                areaSummary.cumSum = areaSummary.sum;
            } else {
                const prevKeyframe = sortedTimeGroup[keyframeIndex - 1];
                const prevTimeGroup = prevKeyframe[1];
                const prevAreaGroupMap = prevTimeGroup.areaGroupMap;
                const prevAreaGroup = prevAreaGroupMap.get(areaName);
                if (prevAreaGroup) {
                    const prevAreaCumSum = prevAreaGroup.summary.cumSum;
                    areaSummary.cumSum = prevAreaCumSum + areaSummary.sum;
                } else {
                    console.log(`当前是第${keyframeIndex}帧，上一帧没有${areaName}`);
                }
            }
        })

        // 通过 cumSum 计算 rank
        const sortedAreaGroup = [...areaGroupMap.entries()].sort(([areaNameA, areaDetailA], [areaNameB, areaDetailB]) => {
            return d3.descending(areaDetailA.summary.cumSum, areaDetailB.summary.cumSum);
        })
        sortedAreaGroup.forEach(([areaName], index) => {
            areaGroupMap.get(areaName).summary.rank = index;
        })
        timeGroup.sortedAreaGroup = sortedAreaGroup;
        timeGroup.treeRoot = calcTreeRoot(timeGroup);

        timeGroupSummary.maxCumSumAreaName = sortedAreaGroup[0]?.[0];
        timeGroupSummary.maxCumSumValue = sortedAreaGroup[0]?.[1].summary.cumSum;
    })

    function calcTreeRoot(keyframe) {
        // 根节点必须唯一
        const wrapper = ['root', {group: keyframe.sortedAreaGroup}];

        const hierarchyRoot = d3.hierarchy(wrapper, node => node[1].group);

        // 分好层以后计算每一层的数值。(暂时用children的个数作为value)
        hierarchyRoot.sum(node => {
            // console.log('node是');
            // console.log(node);
            return node[1] && node[1].summary && node[1].summary.sum || 0;
            // return node[1] && node[1].group && node[1].group.length || 0;
        })

        // treemapBinary, treemapDice,treemapSlice,treemapSliceDice,treemapSquarify,treemapResquarify
        // 计算布局坐标
        return d3.treemap()
            .tile(d3.treemapSquarify)
            .size([dimensions.boundWidth, dimensions.boundHeight])
            .padding(5)
            (hierarchyRoot);
    }

    const getPrevKeyframeRectValue = (curKeyframeIndex, areaName) => {
        if (curKeyframeIndex === 0) return 0;

        const prevKeyframeIndex = curKeyframeIndex - 1;

        const prevKeyframe = sortedTimeGroup[prevKeyframeIndex][1]; // [0] 是时间

        // root 下级的节点（区域）
        const childrenNodeInPrevKeyframe = prevKeyframe.treeRoot.children;
        const matchedAreaNode = childrenNodeInPrevKeyframe.find(node => node.data[0] === areaName);
        return matchedAreaNode.value || 0;
    }

    const initRects = () => {
        // 初始化叶子节点的视图
        const rectGroup = svg.append('g').classed('rect-group', true);
        const labelGroup = svg.append('g').classed('label-group', true);

        return (nodes, transition, keyframeIndex) => {
            // 矩形
            rectGroup
                .selectAll('rect')
                .data(nodes, d => d.data[0])
                .join(enter => {
                    return enter
                        .append('rect')
                        .attr('x', d => d.x0)
                        .attr('y', d => d.y0)
                        .attr("width", d => d.x1 - d.x0)
                        .attr("height", d => d.y1 - d.y0)
                        .attr('fill', '#4682b4')
                        .attr("stroke", 'black')
                        .attr("stroke-width", '1')
                },)
                .transition(transition)
                .attr('x', d => d.x0)
                .attr('y', d => d.y0)
                .attr("width", d => d.x1 - d.x0)
                .attr("height", d => d.y1 - d.y0)

            // 文字label
            labelGroup
                .selectAll('text')
                .data(nodes, d => d.data[0])
                .join(enter => {
                    return enter
                        .append('text')
                        .attr('x', d => d.x0)
                        .attr('y', d => d.y0)
                        .text(d => {
                            return `${d.data[0]}: ${d.value}`
                        })
                        .attr('dy', '2px')
                        .attr('alignment-baseline', 'hanging')
                        .attr('fill', '#fff')
                },)
                .transition(transition)
                .textTween((node) => {
                    const areaName = node.data[0];
                    const prevValue = getPrevKeyframeRectValue(keyframeIndex, areaName);
                    const i = d3.interpolateRound(prevValue, node.value);

                    return (t) => {
                        return `${areaName}: ${i(t)}`
                    }
                })
                .attr('x', d => d.x0)
                .attr('y', d => d.y0)

        }
    }

    const updateRects = initRects();


    const timeFormatter = d3.timeFormat("%Y-%m")

    const getUpdateTimeText = () => {
        // 大的时间标识
        const curTimeText = svg
            .append('text')
            .attr('x', dimensions.boundWidth)
            .attr('y', dimensions.boundHeight)
            .style('fill', '#9aa089')
            .attr('stroke-width', '0')
            .style('font-size', '35px')
            .style('pointer-events', 'none')
            .style('user-select', 'none')
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'bottom')
        // update text
        return (time, transition) => {
            transition.end().then(() => {
                curTimeText.text(timeFormatter(time))
            });
        }
    }

    const updateTimeText = getUpdateTimeText();


    let keyframeIndex = -1;
    // 绘制每一帧
    for (const [time, keyframe] of sortedTimeGroup) {
        keyframeIndex++;
        const linearTransition = d3.transition().ease(d3.easeLinear).duration(2000);
        // 更新当前的时间文本
        updateTimeText(time, linearTransition);
        const childrenNodeInKeyframe = keyframe.treeRoot.children;
        updateRects(childrenNodeInKeyframe, linearTransition, keyframeIndex);

        await linearTransition.end().catch((e) => {
            console.log(e);
        })
    }


}

// 获取数据、解析数据
const fetchData = async () => {
    const plainCsvText = await d3.text('/电商销售数据.csv');
    return d3.csvParseRows(plainCsvText, row => row.map((cell, index) => {
            if (index === 0) return new Date(Date.parse(cell));
            return parseString(cell)
        }
    ));
}

const parseString = (string) => {
    // const timestamp = Date.parse(string);
    // if (!isNaN(timestamp)) return new Date(timestamp);
    if (!isNaN(string)) return parseFloat(string);
    return string;
}
