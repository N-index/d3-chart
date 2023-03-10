import * as d3 from './src/utils/d3';

export const drawChart = async (container) => {
    console.log('---draw bar race chart---');
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

    console.log('bar里的container')
    console.log(container);

    const svg = d3.select(container)
        .append('svg')
        .attr('width', dimensions.width)
        .attr('height', dimensions.height)
        .append('g')
        .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);


    const orderDateAccessor = d => d[0]; // 销售日期
    const sellAmount = d => d[10]; // 销售数量

    const areaAccessor = d => d[4]; // 区域
    const sellMoneyAccessor = d => {
        return d[11];
    }; // 销售金额

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

        timeGroupSummary.maxCumSumAreaName = sortedAreaGroup[0]?.[0];
        timeGroupSummary.maxCumSumValue = sortedAreaGroup[0]?.[1].summary.cumSum;
    })


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

    // 销售金额比例尺
    const sellMoneyScale = d3.scaleLinear().range([0, dimensions.boundWidth - 150]);
    const getUpdateAxis = () => {
        // X轴容器
        const g = svg
            .append('g')
            .attr('class', 'my-axis')
            .style('color', 'steelblue');

        // 生成X轴
        const axis = d3.axisTop(sellMoneyScale);

        // 调用此方法更新Axis
        return (transition) => {
            g.transition(transition).call(axis)
        }
    }

    const getUpdateBar = () => {
        // 画所有条形
        const barGroup = svg
            .append('g')
            .classed('bar-group', true)

        const barText = svg
            .append('g')
            .classed('bar-text', true)

        return (keyframe, transition) => {
            barGroup
                .selectAll('rect')
                .data(keyframe.sortedAreaGroup, areaRecord => {
                    return areaRecord[0]
                })
                .join(
                    enter => {
                        return enter
                            .append('rect')
                            .attr('x', 0)
                            .attr('height', 20)
                            .attr('fill', 'steelblue')
                            .attr('y', (areaRecord) => {
                                const [_, areaDetail] = areaRecord;
                                const {rank} = areaDetail.summary;
                                return rank * 50
                            })
                    },
                )
                .transition(transition)
                .attr('y', (areaRecord) => {
                    const [_, areaDetail] = areaRecord;
                    const {rank} = areaDetail.summary;
                    return rank * 50
                })
                .attr('width', areaRecord => {
                    const [_, areaDetail] = areaRecord;
                    const {cumSum} = areaDetail.summary;
                    return sellMoneyScale(cumSum)
                })


            barText
                .selectAll('text')
                .data(keyframe.sortedAreaGroup, areaRecord => {
                    return areaRecord[0]
                })
                .join(enter => {
                    return enter
                        .append('text')
                        .attr('y', (areaRecord) => {
                            const [_, areaDetail] = areaRecord;
                            const {rank} = areaDetail.summary;
                            return rank * 50
                        })
                        .attr('dx', '5px')
                        .attr('dy', '10px')
                        .attr('alignment-baseline', 'middle')
                        .attr('color', 'red')
                },)
                .transition(transition)
                // .tween('text', (areaRecord) => {
                //     const [areaName, areaDetail] = areaRecord;
                //     const {cumSum, sum} = areaDetail.summary;
                //
                //     const i = d3.interpolateRound(cumSum - sum, cumSum);
                //     return function (t) {
                //         this.textContent = areaName + ': ' + i(t)
                //     }
                // })
                .textTween((areaRecord) => {
                    const [areaName, areaDetail] = areaRecord;
                    const {cumSum, sum} = areaDetail.summary;
                    const i = d3.interpolateRound(cumSum - sum, cumSum);
                    return (t) => {
                        return `${areaName}: ${i(t)}`
                    }
                })
                .attr('x', areaRecord => {
                    const [_, areaDetail] = areaRecord;
                    const {cumSum} = areaDetail.summary;
                    return sellMoneyScale(cumSum)
                })
                .attr('y', (areaRecord) => {
                    const [_, areaDetail] = areaRecord;
                    const {rank} = areaDetail.summary;
                    return rank * 50
                })
        }
    }
    const updateBar = getUpdateBar();

    const updateAxis = getUpdateAxis();


    // 绘制每一帧
    for (const [time, keyframe] of sortedTimeGroup) {
        const linearTransition = d3.transition('bar-race').ease(d3.easeLinear).duration(2000).delay(0);

        // 更新当前的时间文本
        updateTimeText(time, linearTransition);

        // 更新值域，更新Axis
        sellMoneyScale.domain([0, keyframe.summary.maxCumSumValue]);
        updateAxis(linearTransition);
        updateBar(keyframe, linearTransition);

        await linearTransition.end()


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
