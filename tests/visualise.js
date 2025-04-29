const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');

/**
 * Find the most recent CSV file in the test-results directory
 */
function findLatestCsv() {
  const resultsDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(resultsDir)) {
    console.error('Error: test-results directory not found at', resultsDir);
    return null;
  }

  const files = fs.readdirSync(resultsDir)
    .filter(file => file.startsWith('test-results-') && file.endsWith('.csv'))
    .map(file => ({
      name: file,
      path: path.join(resultsDir, file),
      time: fs.statSync(path.join(resultsDir, file)).mtime.getTime()
    }));

  if (files.length === 0) {
    console.error('Error: No CSV files matching "test-results-*.csv" found in', resultsDir);
    return null;
  }

  // Sort by last modified time (newest first)
  files.sort((a, b) => b.time - a.time);

  console.log(`Using latest CSV file: ${files[0].name}`);
  return files[0].path;
}

/**
 * Parse CSV file into an array of objects
 */
function parseCsv(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split(/\r?\n/); // Handle both Windows and Unix line endings
    if (lines.length < 2) {
      console.error(`Error: CSV file '${filePath}' is empty or has only headers.`);
      return [];
    }
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map((line, lineIndex) => {
      // Basic CSV parsing, handles simple cases but not escaped commas within quotes robustly
      const values = line.split(',');
      const obj = {};

      headers.forEach((header, index) => {
        let value = values[index] ? values[index].trim() : undefined;

        // Handle simple quoted strings (remove surrounding quotes)
        if (value && typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        // Try to convert numeric values, but avoid converting empty strings or non-numeric strings
        if (value !== undefined && value !== '' && !isNaN(value)) {
          value = parseFloat(value);
        } else if (value === '') {
           // Keep empty strings as empty, not undefined or NaN
           value = '';
        }


        obj[header] = value;
      });
      return obj;
    });
  } catch (error) {
    console.error(`Error reading or parsing CSV file '${filePath}':`, error);
    return null; // Indicate failure
  }
}


/**
 * Create output directory if it doesn't exist
 */
function ensureOutputDir() {
  const outputDir = path.join(__dirname, 'chart-output');
  if (!fs.existsSync(outputDir)) {
    try {
        fs.mkdirSync(outputDir);
        console.log(`Created output directory: ${outputDir}`);
    } catch (error) {
        console.error(`Error creating output directory '${outputDir}':`, error);
        return null;
    }
  }
  return outputDir;
}

/**
 * Generate a chart and save it to a PNG file
 */
function createChart(config, outputPath) {
  const { width = 800, height = 500, ...chartConfig } = config;

  try {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set a background color for better visibility if charts have transparency
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    new Chart(ctx, chartConfig);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    console.log(`Chart saved to: ${path.basename(outputPath)}`);
  } catch (error) {
      console.error(`Error creating chart '${path.basename(outputPath)}':`, error);
  }
}

/**
 * Calculate throughput (MB/s) for file uploads
 */
function calculateThroughput(fileSize, durationMs) {
    if (!fileSize || !durationMs || durationMs <= 0) return 0;
    const sizeMB = fileSize / (1024 * 1024);
    const durationS = durationMs / 1000;
    return sizeMB / durationS;
}

/**
 * Upload performance visualisation grouped by file name
 */
function createFileUploadSizeChart(data, outputDir) {
  // Filter file uploads with valid duration and size
  const fileUploads = data.filter(item =>
      item.operation === 'file_upload' &&
      item.filename &&
      item.fileSize > 0 &&
      item.duration > 0
  );

  if (fileUploads.length === 0) {
    console.log('No valid file upload data found for throughput chart.');
    return;
  }

  // Group by filename
  const fileUploadsByName = {};
  fileUploads.forEach(item => {
    if (!fileUploadsByName[item.filename]) {
      fileUploadsByName[item.filename] = {
          durations: [],
          throughputs: [],
          size: item.fileSize
      };
    }
    fileUploadsByName[item.filename].durations.push(item.duration);
    fileUploadsByName[item.filename].throughputs.push(calculateThroughput(item.fileSize, item.duration));
  });

  // Calculate stats and prepare data
  const uploadStats = Object.entries(fileUploadsByName).map(([filename, stats]) => {
    const avgDuration = stats.durations.reduce((sum, val) => sum + val, 0) / stats.durations.length;
    const avgThroughput = stats.throughputs.reduce((sum, val) => sum + val, 0) / stats.throughputs.length;
    return {
      filename: filename,
      size: stats.size,
      avgDuration: avgDuration,
      minDuration: Math.min(...stats.durations),
      maxDuration: Math.max(...stats.durations),
      avgThroughput: avgThroughput,
      minThroughput: Math.min(...stats.throughputs),
      maxThroughput: Math.max(...stats.throughputs)
    };
  });

  // Sort by file size
  uploadStats.sort((a, b) => a.size - b.size);

  // Format labels with actual file sizes in MB/KB
   const labels = uploadStats.map(item => {
    let sizeStr;
    if (item.size >= 1024 * 1024) {
        sizeStr = `${(item.size / (1024 * 1024)).toFixed(2)} MB`;
    } else if (item.size >= 1024) {
        sizeStr = `${(item.size / 1024).toFixed(2)} KB`;
    } else {
        sizeStr = `${item.size} B`;
    }
    return `${item.filename} (${sizeStr})`;
  });

  // Create a throughput bar chart
  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Min Throughput (MB/s)',
          data: uploadStats.map(item => item.minThroughput),
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1
        },
        {
          label: 'Average Throughput (MB/s)',
          data: uploadStats.map(item => item.avgThroughput),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1
        },
        {
          label: 'Max Throughput (MB/s)',
          data: uploadStats.map(item => item.maxThroughput),
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgb(255, 99, 132)',
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'File Upload Throughput by File',
          font: { size: 18 }
        },
        tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(2) + ' MB/s';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Throughput (MB/s)'
          }
        },
        x: {
            title: {
                display: true,
                text: 'File (Size)'
            }
        }
      }
    }
  }, path.join(outputDir, 'file-upload-throughput.png'));
}

/**
 * Create improved concurrent upload visualization with all batch sizes
 */
function createConcurrentUploadCharts(data, outputDir) {
  const concurrentUploads = data.filter(item =>
      item.operation === 'concurrent_upload' &&
      item.batchSize > 0 && // Ensure batchSize is valid
      item.duration > 0 && // Ensure duration is valid
      item.throughput !== undefined && // Ensure throughput is present
      item.successCount !== undefined // Ensure successCount is present
  );

  if (concurrentUploads.length === 0) {
    console.log('No valid concurrent upload data found for charts.');
    return;
  }

  // Sort by batch size
  concurrentUploads.sort((a, b) => a.batchSize - b.batchSize);

  const batchSizes = concurrentUploads.map(item => `Batch ${item.batchSize}`);

  // Create throughput chart
  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: batchSizes,
      datasets: [{
        label: 'Throughput (uploads/s)',
        data: concurrentUploads.map(item => item.throughput),
        backgroundColor: 'rgba(255, 159, 64, 0.6)',
        borderColor: 'rgb(255, 159, 64)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Concurrent Upload Throughput vs Batch Size',
          font: { size: 18 }
        },
        tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(3) + ' uploads/s';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Throughput (uploads/s)'
          }
        },
        x: {
            title: {
                display: true,
                text: 'Batch Size'
            }
        }
      }
    }
  }, path.join(outputDir, 'concurrent-throughput.png'));

  // Create execution time chart
  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: batchSizes,
      datasets: [{
        label: 'Total Execution Time (s)',
        data: concurrentUploads.map(item => item.duration / 1000), // Convert to seconds
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
        borderColor: 'rgb(153, 102, 255)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Concurrent Upload Execution Time vs Batch Size',
          font: { size: 18 }
        },
         tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(2) + ' s';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Time (seconds)'
          }
        },
        x: {
            title: {
                display: true,
                text: 'Batch Size'
            }
        }
      }
    }
  }, path.join(outputDir, 'concurrent-execution-time.png'));

  // Calculate efficiency (throughput per batch item) - checking for division by zero
  const efficiencyData = concurrentUploads.map(item => ({
    batchSize: item.batchSize,
    efficiency: item.batchSize > 0 ? (item.throughput / item.batchSize) : 0
  }));

  // Create efficiency chart
  createChart({
    width: 900,
    height: 600,
    type: 'line',
    data: {
      labels: batchSizes,
      datasets: [{
        label: 'Efficiency (throughput per batch item)',
        data: efficiencyData.map(item => item.efficiency),
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgb(255, 99, 132)',
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 6,
        fill: true
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Concurrent Upload Efficiency vs Batch Size',
          font: { size: 18 }
        },
        tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(4); // More precision for efficiency
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Efficiency (uploads/s / item)'
          }
        },
         x: {
            title: {
                display: true,
                text: 'Batch Size'
            }
        }
      }
    }
  }, path.join(outputDir, 'concurrent-efficiency.png'));

  // Create combined chart (throughput and execution time)
  createChart({
    width: 1000,
    height: 600,
    type: 'bar',
    data: {
      labels: batchSizes,
      datasets: [
        {
          label: 'Throughput (uploads/s)',
          data: concurrentUploads.map(item => item.throughput),
          backgroundColor: 'rgba(255, 159, 64, 0.6)',
          borderColor: 'rgb(255, 159, 64)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Execution Time (s)',
          data: concurrentUploads.map(item => item.duration / 1000),
          backgroundColor: 'rgba(153, 102, 255, 0.6)',
          borderColor: 'rgb(153, 102, 255)',
          borderWidth: 1,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Concurrent Upload Performance (Throughput & Time)',
          font: { size: 18 }
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        if (context.dataset.yAxisID === 'y1') { // Execution Time
                            label += context.parsed.y.toFixed(2) + ' s';
                        } else { // Throughput
                            label += context.parsed.y.toFixed(3) + ' uploads/s';
                        }
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: 'Throughput (uploads/s)'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: 'Execution Time (s)'
          },
          grid: {
            drawOnChartArea: false // Only draw grid lines for the first Y axis
          }
        },
        x: {
            title: {
                display: true,
                text: 'Batch Size'
            }
        }
      }
    }
  }, path.join(outputDir, 'concurrent-combined.png'));

  // Create a success rate chart - checking for division by zero
  const successRates = concurrentUploads.map(item =>
      item.batchSize > 0 ? (item.successCount / item.batchSize) * 100 : 0
  );

  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: batchSizes,
      datasets: [{
        label: 'Success Rate (%)',
        data: successRates,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgb(75, 192, 192)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Concurrent Upload Success Rate vs Batch Size',
          font: { size: 18 }
        },
        tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(1) + '%';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          min: 0, // Ensure scale starts at 0%
          max: 100, // Ensure scale ends at 100%
          title: {
            display: true,
            text: 'Success Rate (%)'
          }
        },
        x: {
            title: {
                display: true,
                text: 'Batch Size'
            }
        }
      }
    }
  }, path.join(outputDir, 'concurrent-success-rate.png'));
}

/**
 * Create content retrieval visualizations by iteration
 */
function createContentRetrievalCharts(data, outputDir) {
  const retrievals = data.filter(item =>
      item.operation === 'content_retrieval' &&
      item.iteration !== undefined && // Ensure iteration is present
      item.duration > 0 // Ensure duration is valid
  );

  if (retrievals.length === 0) {
    console.log('No valid content retrieval data found for charts.');
    return;
  }

  // Sort by iteration
  retrievals.sort((a, b) => a.iteration - b.iteration);

  // Create chart showing retrieval time by iteration
  createChart({
    width: 900,
    height: 600,
    type: 'line', // Line chart might show trends better
    data: {
      labels: retrievals.map(item => `Retrieval ${item.iteration}`), // Use iteration number directly
      datasets: [{
        label: 'Content Retrieval Duration (ms)',
        data: retrievals.map(item => item.duration),
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgb(75, 192, 192)',
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 5,
        fill: true
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Content Retrieval Performance by Iteration',
          font: { size: 18 }
        },
         tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toFixed(2) + ' ms';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Duration (ms)'
          }
        },
        x: {
            title: {
                display: true,
                text: 'Iteration'
            }
        }
      }
    }
  }, path.join(outputDir, 'content-retrieval-by-iteration.png'));

  // Create histogram of retrieval times
  const durations = retrievals.map(item => item.duration);
  const minTime = Math.min(...durations);
  const maxTime = Math.max(...durations);
  const numBuckets = 10; // Or determine dynamically based on range
  const bucketSize = Math.max(1, Math.ceil((maxTime - minTime + 1) / numBuckets)); // Ensure bucket size is at least 1

  const buckets = {};
  // Initialize buckets
  for (let i = 0; i < numBuckets; i++) {
      const start = Math.floor(minTime / bucketSize) * bucketSize + i * bucketSize;
      buckets[start] = 0;
  }


  durations.forEach(duration => {
      const bucketStart = Math.floor(duration / bucketSize) * bucketSize;
      // Ensure the bucket exists, especially if minTime=maxTime
       if (buckets[bucketStart] === undefined) {
           // This might happen if the calculated range is very small
           // Find the closest existing bucket or create a new one if necessary
           const closestBucket = Object.keys(buckets).reduce((prev, curr) =>
               Math.abs(curr - bucketStart) < Math.abs(prev - bucketStart) ? curr : prev
           );
           buckets[closestBucket]++;
       } else {
           buckets[bucketStart]++;
       }
  });


  const bucketLabels = Object.keys(buckets).sort((a,b) => parseInt(a) - parseInt(b)).map(key => {
      const start = parseInt(key);
      const end = start + bucketSize;
      return `${start}-${end} ms`;
  });
  const bucketCounts = Object.keys(buckets).sort((a,b) => parseInt(a) - parseInt(b)).map(key => buckets[key]);


  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: bucketLabels,
      datasets: [{
        label: 'Number of Retrievals',
        data: bucketCounts,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgb(54, 162, 235)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Content Retrieval Time Distribution',
          font: { size: 18 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Count'
          },
          ticks: {
            stepSize: 1 // Ensure integer counts on y-axis
          }
        },
        x: {
          title: {
            display: true,
            text: 'Duration Range (ms)'
          }
        }
      }
    }
  }, path.join(outputDir, 'content-retrieval-histogram.png'));
}

/**
 * Create version operations charts
 */
function createVersionOperationCharts(data, outputDir) {
  const versionOps = data.filter(item =>
    (item.operation === 'version_create' || item.operation === 'version_fetch') &&
    item.versionNumber !== undefined && // Ensure version number exists
    item.duration > 0 // Ensure duration is valid
  );

  if (versionOps.length === 0) {
    console.log('No valid version operation data found for charts.');
    return;
  }

  // Group by version number
  const versionsByNumber = {};
  versionOps.forEach(item => {
    const versionNum = item.versionNumber;
    if (!versionsByNumber[versionNum]) {
      versionsByNumber[versionNum] = {
        create: null,
        fetch: null
      };
    }

    if (item.operation === 'version_create') {
      versionsByNumber[versionNum].create = item.duration;
    } else if (item.operation === 'version_fetch') {
      versionsByNumber[versionNum].fetch = item.duration;
    }
  });

  // Prepare datasets - filter out versions where one operation might be missing
  const versionNumbers = Object.keys(versionsByNumber)
                             .map(num => parseInt(num)) // Convert to numbers for sorting
                             .sort((a, b) => a - b);

  const labels = versionNumbers.map(num => `Version ${num}`);
  const createDurations = versionNumbers.map(num => versionsByNumber[num].create);
  const fetchDurations = versionNumbers.map(num => versionsByNumber[num].fetch);

  // Create chart showing create and fetch times by version (using logarithmic scale due to potential differences)
  createChart({
    width: 900,
    height: 600,
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Creation Time (ms)',
          data: createDurations,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgb(255, 99, 132)',
          borderWidth: 1
        },
        {
          label: 'Fetch Time (ms)',
          data: fetchDurations,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Version Operation Performance by Version Number',
          font: { size: 18 }
        },
         tooltip: {
             callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    // Display null values clearly
                    if (context.parsed.y === null) {
                         label += 'N/A';
                    } else if (context.parsed.y !== undefined) {
                        label += context.parsed.y.toFixed(2) + ' ms';
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        y: {
          beginAtZero: true, // Log scale handles zero automatically if needed, but start axis visually at 0
          title: {
            display: true,
            text: 'Duration (ms) - Log Scale'
          },
          type: 'logarithmic' // Use log scale for potentially large differences
        },
        x: {
            title: {
                display: true,
                text: 'Version Number'
            }
        }
      }
    }
  }, path.join(outputDir, 'version-operations-by-version.png'));

  // Create comparison chart showing average create and fetch times
  const validCreateDurations = createDurations.filter(d => d !== null);
  const validFetchDurations = fetchDurations.filter(d => d !== null);

  const avgCreate = validCreateDurations.length > 0 ? validCreateDurations.reduce((sum, val) => sum + val, 0) / validCreateDurations.length : 0;
  const avgFetch = validFetchDurations.length > 0 ? validFetchDurations.reduce((sum, val) => sum + val, 0) / validFetchDurations.length : 0;

  if (avgCreate > 0 || avgFetch > 0) { // Only create average chart if there's data
      createChart({
        width: 800,
        height: 600,
        type: 'bar',
        data: {
          labels: ['Create Version', 'Fetch Version History'],
          datasets: [{
            label: 'Average Duration (ms)',
            data: [avgCreate, avgFetch],
            backgroundColor: [
              'rgba(255, 99, 132, 0.6)',
              'rgba(54, 162, 235, 0.6)'
            ],
            borderColor: [
              'rgb(255, 99, 132)',
              'rgb(54, 162, 235)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: 'Average Version Operation Performance',
              font: { size: 18 }
            },
             tooltip: {
                 callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(2) + ' ms';
                        }
                        return label;
                    }
                }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Duration (ms)'
              }
              // Maybe remove log scale here if averages are closer
              // type: 'logarithmic'
            }
          }
        }
      }, path.join(outputDir, 'version-operations-avg.png'));
  }
}

/**
 * Create comprehensive operation comparison chart
 */
function createOperationComparisonChart(data, outputDir) {
   // Filter out items without a valid duration
   const validData = data.filter(item => item.duration > 0 && item.operation);

   if (validData.length === 0) {
       console.log("No valid data with duration > 0 found for operation comparison.");
       return;
   }

  // Group by operation and calculate statistics
  const operations = {};
  validData.forEach(item => {
    if (!operations[item.operation]) {
      operations[item.operation] = {
        count: 0,
        totalDuration: 0,
        durations: []
      };
    }

    operations[item.operation].count++;
    operations[item.operation].totalDuration += item.duration;
    operations[item.operation].durations.push(item.duration);
  });

  const operationData = Object.entries(operations).map(([name, stats]) => ({
    name,
    avgDuration: stats.totalDuration / stats.count,
    minDuration: Math.min(...stats.durations),
    maxDuration: Math.max(...stats.durations),
    count: stats.count
  }));

  // Sort operations by average duration (ascending)
  operationData.sort((a, b) => a.avgDuration - b.avgDuration);

  // Define consistent colors for operations
  const colors = [
      'rgba(75, 192, 192, 0.6)', 'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)',
      'rgba(255, 99, 132, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
      'rgba(199, 199, 199, 0.6)', 'rgba(83, 109, 254, 0.6)', 'rgba(0, 200, 83, 0.6)',
      'rgba(255, 61, 113, 0.6)'
  ];
  const borderColors = colors.map(color => color.replace('0.6', '1')); // Make border fully opaque

  const backgroundColors = operationData.map((_, i) => colors[i % colors.length]);
  const borderColorsMapped = operationData.map((_, i) => borderColors[i % borderColors.length]);


  // Create average duration chart (logarithmic scale)
  createChart({
    width: 1000,
    height: 600,
    type: 'bar',
    data: {
      labels: operationData.map(op => op.name),
      datasets: [{
        label: 'Average Duration (ms)',
        data: operationData.map(op => op.avgDuration),
        backgroundColor: backgroundColors,
        borderColor: borderColorsMapped,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal bar chart can be easier to read with long labels
      plugins: {
        title: {
          display: true,
          text: 'Average Duration by Operation Type (Log Scale)',
          font: { size: 18 }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) { label += ': '; }
              if (context.parsed.x !== null) {
                label += context.parsed.x.toFixed(2) + ' ms';
              }
              return label;
            },
            afterLabel: function(context) {
              const index = context.dataIndex;
              const op = operationData[index];
              return [
                `Count: ${op.count}`,
                `Min: ${op.minDuration.toFixed(2)} ms`,
                `Max: ${op.maxDuration.toFixed(2)} ms`
              ];
            }
          }
        }
      },
      scales: {
        x: { // Switched x and y because of indexAxis: 'y'
          type: 'logarithmic',
          title: {
            display: true,
            text: 'Average Duration (ms) - Log Scale'
          }
        },
        y: {
             ticks: {
                 autoSkip: false // Ensure all operation names are shown
             }
        }
      }
    }
  }, path.join(outputDir, 'operation-comparison-log.png'));

  // Create min/avg/max chart (also horizontal)
  createChart({
    width: 1000,
    height: 700, // Taller to accommodate labels and legend
    type: 'bar',
    data: {
      labels: operationData.map(op => op.name),
      datasets: [
        {
          label: 'Min Duration (ms)',
          data: operationData.map(op => op.minDuration),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1
        },
        {
          label: 'Avg Duration (ms)',
          data: operationData.map(op => op.avgDuration),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1
        },
        {
          label: 'Max Duration (ms)',
          data: operationData.map(op => op.maxDuration),
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgb(255, 99, 132)',
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        title: {
          display: true,
          text: 'Operation Performance Range (Min/Avg/Max) - Log Scale',
          font: { size: 18 }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) { label += ': '; }
              if (context.parsed.x !== null) {
                label += context.parsed.x.toFixed(2) + ' ms';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: {
            display: true,
            text: 'Duration (ms) - Log Scale'
          }
        },
        y: {
            ticks: {
                autoSkip: false
            }
        }
      }
    }
  }, path.join(outputDir, 'operation-minmax.png'));

  // Create operation count chart (pie chart)
  createChart({
    width: 800,
    height: 700, // Taller for legend
    type: 'pie',
    data: {
      labels: operationData.map(op => op.name),
      datasets: [{
        label: 'Operation Count',
        data: operationData.map(op => op.count),
        backgroundColor: backgroundColors,
        borderColor: borderColorsMapped,
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Distribution of Operation Counts',
          font: { size: 18 }
        },
        legend: {
            position: 'right', // Move legend if too many items for top/bottom
             labels: {
                padding: 10 // Add padding between legend items
            }
        },
        tooltip: {
           callbacks: {
                label: function(context) {
                    let label = context.label || '';
                    let value = context.parsed || 0;
                    let total = context.chart.getDatasetMeta(0).total;
                    let percentage = ((value / total) * 100).toFixed(1) + '%';
                    if (label) {
                        label += ': ';
                    }
                    label += `${value} (${percentage})`;
                    return label;
                }
            }
        }
      }
    }
  }, path.join(outputDir, 'operation-distribution.png'));
}

/**
 * Create a performance dashboard combining key metrics
 */
function createPerformanceDashboard(data, outputDir) {
  // Filter out items without a valid duration
  const validData = data.filter(item => item.duration > 0 && item.operation);
  if (validData.length === 0) {
       console.log("No valid data with duration > 0 found for dashboard.");
       return;
   }

  // Prepare statistics for all operation types
  const operations = {};
  validData.forEach(item => {
    if (!operations[item.operation]) {
      operations[item.operation] = {
        count: 0,
        totalDuration: 0
      };
    }
    operations[item.operation].count++;
    operations[item.operation].totalDuration += item.duration;
  });

  const opStats = Object.entries(operations).map(([name, stats]) => ({
    name,
    avgDuration: stats.totalDuration / stats.count,
    count: stats.count
  }));

  // Sort by average duration (ascending) to potentially group faster ops together
  opStats.sort((a, b) => a.avgDuration - b.avgDuration);

  // Create dashboard chart (horizontal bar for duration, line for count)
  createChart({
    width: 1200,
    height: 800,
    type: 'bar', // Base type is bar
    data: {
      labels: opStats.map(op => op.name),
      datasets: [
        {
          label: 'Average Duration (ms)',
          data: opStats.map(op => op.avgDuration),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 1,
          yAxisID: 'yDuration', // Assign to the duration axis
          order: 2 // Draw bars behind the line
        },
        {
          label: 'Operation Count',
          data: opStats.map(op => op.count),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderWidth: 2,
          yAxisID: 'yCount', // Assign to the count axis
          type: 'line', // Override type for this dataset
          pointRadius: 6,
          tension: 0.1,
          fill: false,
          order: 1 // Draw line on top
        }
      ]
    },
    options: {
      indexAxis: 'y', // Horizontal layout
      plugins: {
        title: {
          display: true,
          text: 'System Performance Dashboard',
          font: { size: 20, weight: 'bold' },
           padding: { bottom: 5 }
        },
        subtitle: {
          display: true,
          text: `Test Date: ${new Date().toLocaleDateString()} | Total Operations: ${validData.length}`,
          font: { size: 14 },
          padding: { bottom: 20 }
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) { label += ': '; }
                     // Use 'x' for value due to indexAxis: 'y'
                    if (context.parsed.x !== null) {
                         if (context.dataset.yAxisID === 'yDuration') {
                             label += context.parsed.x.toFixed(2) + ' ms';
                         } else {
                              label += context.parsed.x; // Count is integer
                         }
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        x: { // This is now the value axis
             // No specific scale settings needed here unless range is huge
        },
        yDuration: { // Left axis for Duration (Log scale)
          type: 'logarithmic',
          position: 'left',
          title: {
            display: true,
            text: 'Average Duration (ms) - Log Scale'
          },
           // Match ticks to labels on the main Y axis
            ticks: {
                callback: function(value, index, values) {
                    // Display the operation name from labels
                    return opStats[index] ? opStats[index].name : '';
                },
                 autoSkip: false
            }
        },
        yCount: { // Right axis for Count
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: 'Operation Count'
          },
          grid: {
            drawOnChartArea: false // Don't clutter with grid lines from both axes
          },
           ticks: {
                // Optionally adjust step size or precision if needed
                precision: 0 // Ensure integer counts
           }
        }
      },

      scales: {
          x: {}, // Value axis
          y: { // Operation names axis
              ticks: { autoSkip: false }
          },
          yDuration: {
              type: 'logarithmic',
              position: 'left',
              title: { display: true, text: 'Avg Duration (ms) - Log Scale' },
          },
          yCount: {
              type: 'linear',
              position: 'right',
              beginAtZero: true,
              title: { display: true, text: 'Operation Count' },
              grid: { drawOnChartArea: false },
              ticks: { precision: 0 }
          }
      }
    }
  }, path.join(outputDir, 'performance-dashboard.png'));
}


/**
 * Generate a performance summary report in text format
 */
function createSummaryReport(data, outputDir) {
  // Filter out items without a valid duration
  const validData = data.filter(item => item.duration > 0 && item.operation);
   if (validData.length === 0) {
       console.log("No valid data with duration > 0 found for summary report.");
       return;
   }

  // Group by operation
  const operations = {};
  validData.forEach(item => {
    if (!operations[item.operation]) {
      operations[item.operation] = {
        count: 0,
        totalDuration: 0,
        durations: [],
        items: [] // Store items for more detailed stats if needed
      };
    }
    operations[item.operation].count++;
    operations[item.operation].totalDuration += item.duration;
    operations[item.operation].durations.push(item.duration);
    operations[item.operation].items.push(item);
  });

  // Calculate statistics for each operation
  const stats = {};
  Object.entries(operations).forEach(([operation, opData]) => {
    stats[operation] = {
      count: opData.count,
      avgDuration: opData.totalDuration / opData.count,
      minDuration: Math.min(...opData.durations),
      maxDuration: Math.max(...opData.durations),
      items: opData.items // Keep items for specific details below
    };
  });

  // Generate report
  let report = 'System Performance Test Summary\n';
  report += '==============================\n\n';

  report += `Test Date: ${new Date().toLocaleString()}\n`;
  report += `Total Operations Recorded: ${validData.length}\n\n`;

  report += 'Overall Operation Statistics (Duration in ms):\n';
  report += '---------------------------------------------\n\n';

  // Sort operations alphabetically for consistent order in the report
  const sortedOps = Object.entries(stats)
    .sort((a, b) => a[0].localeCompare(b[0])) // Sort by operation name
    .map(([op, stat]) => ({ operation: op, ...stat }));

  // Header for the table
  report += 'Operation'.padEnd(20) +
            'Count'.padStart(8) +
            'Avg (ms)'.padStart(12) +
            'Min (ms)'.padStart(12) +
            'Max (ms)'.padStart(12) + '\n';
  report += '-'.repeat(20) +
            ' '.repeat(1) + '-'.repeat(7) +
            ' '.repeat(1) + '-'.repeat(10) +
            ' '.repeat(1) + '-'.repeat(10) +
            ' '.repeat(1) + '-'.repeat(10) + '\n';

  // Add data rows
  sortedOps.forEach(({ operation, count, avgDuration, minDuration, maxDuration }) => {
    report += operation.padEnd(20) +
              count.toString().padStart(8) +
              avgDuration.toFixed(2).padStart(12) +
              minDuration.toFixed(2).padStart(12) +
              maxDuration.toFixed(2).padStart(12) + '\n';
  });
  report += '\n';

  // --- Add Specific Operation Details ---

  // File Upload Details
  if (stats['file_upload']) {
    report += 'File Upload Details:\n';
    report += '-------------------\n';
    const uploadsByName = {};
    stats['file_upload'].items.forEach(item => {
        if (item.filename && item.fileSize > 0 && item.duration > 0) {
             if (!uploadsByName[item.filename]) {
                uploadsByName[item.filename] = {
                    count: 0,
                    totalDuration: 0,
                    totalSize: 0,
                    fileSize: item.fileSize
                };
             }
             uploadsByName[item.filename].count++;
             uploadsByName[item.filename].totalDuration += item.duration;
        }
    });

    Object.entries(uploadsByName).forEach(([filename, fileStats]) => {
        const avgDuration = fileStats.totalDuration / fileStats.count;
        const throughput = calculateThroughput(fileStats.fileSize, avgDuration);
        let sizeStr = `${(fileStats.fileSize / (1024*1024)).toFixed(2)} MB`;
        if (fileStats.fileSize < 1024*1024) sizeStr = `${(fileStats.fileSize / 1024).toFixed(2)} KB`;
        if (fileStats.fileSize < 1024) sizeStr = `${fileStats.fileSize} B`;

        report += `  ${filename.padEnd(15)} (${sizeStr.padStart(10)}): ` +
                  `${fileStats.count} uploads, ` +
                  `Avg Duration: ${avgDuration.toFixed(2)} ms, ` +
                  `Avg Throughput: ${throughput.toFixed(2)} MB/s\n`;
    });
    report += '\n';
  }

   // Concurrent Upload Details
  if (stats['concurrent_upload']) {
    report += 'Concurrent Upload Details:\n';
    report += '-------------------------\n';
    // Sort by batch size
    const concurrentItems = stats['concurrent_upload'].items.sort((a, b) => a.batchSize - b.batchSize);

    concurrentItems.forEach(item => {
       if (item.batchSize > 0 && item.duration > 0) {
            const successRate = ((item.successCount / item.batchSize) * 100).toFixed(1);
            report += `  Batch Size: ${item.batchSize.toString().padEnd(4)} ` +
                      `Duration: ${(item.duration / 1000).toFixed(2)} s, ` +
                      `Throughput: ${item.throughput.toFixed(3)} uploads/s, ` +
                      `Success: ${item.successCount}/${item.batchSize} (${successRate}%)\n`;
        }
    });
    report += '\n';
  }

  // Add more details for other operations if needed (e.g., versioning, content retrieval)


  // --- End of Specific Details ---

  report += '------------------------------\n';
  report += 'End of Summary Report\n';

  // Write report to file
  const reportPath = path.join(outputDir, 'performance-summary.txt');
  try {
      fs.writeFileSync(reportPath, report);
      console.log(`Performance summary report saved to: ${path.basename(reportPath)}`);
  } catch (error) {
      console.error(`Error writing summary report to '${path.basename(reportPath)}':`, error);
  }
}

// --- Main Execution Logic ---
function main() {
  console.log("Starting DLTFM performance visualization script...");

  const csvFilePath = findLatestCsv();
  if (!csvFilePath) {
    return; // Error message already printed by findLatestCsv
  }

  const data = parseCsv(csvFilePath);
  if (!data || data.length === 0) {
    console.error("Failed to parse CSV data or CSV is empty. Exiting.");
    return; // Error message already printed by parseCsv or check here
  }
  console.log(`Successfully parsed ${data.length} records from CSV.`);

  const outputDir = ensureOutputDir();
  if (!outputDir) {
      console.error("Failed to ensure output directory exists. Exiting.");
      return; // Error message already printed by ensureOutputDir
  }

  // Generate all charts and the report
  console.log("\nGenerating charts...");
  createFileUploadSizeChart(data, outputDir);
  createConcurrentUploadCharts(data, outputDir);
  createContentRetrievalCharts(data, outputDir);
  createVersionOperationCharts(data, outputDir);
  createOperationComparisonChart(data, outputDir);
  createPerformanceDashboard(data, outputDir);

  console.log("\nGenerating summary report...");
  createSummaryReport(data, outputDir);

  console.log("\nScript finished.");
}

// Run the main function
main();