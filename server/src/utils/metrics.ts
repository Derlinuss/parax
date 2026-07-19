let totalLatency = 0;
let requestCount = 0;

export const trackLatency = (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        totalLatency += duration;
        requestCount++;
    });
    next();
};

export const getMetrics = () => {
    const avgLatency = requestCount === 0 ? 0 : Math.round(totalLatency / requestCount);
    const mem = process.memoryUsage();
    const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const totalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((usedMB / totalMB) * 100);
    
    return {
        latency: `${avgLatency}ms`,
        memory: `${usagePercent}% (${usedMB}MB / ${totalMB}MB)`
    };
};
