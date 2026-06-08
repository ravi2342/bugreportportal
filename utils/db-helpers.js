/**
 * Database Helper Functions
 * Reduces duplication in Prisma operations with fallback to JSON file storage
 */

const { readFallbackReports, saveFallbackReports, readFallbackComments, saveFallbackComments } = require('./file-helpers');

/**
 * Execute a Prisma database operation with automatic JSON file fallback
 * @param {Function} dbOperation - Async function that performs Prisma operation
 * @param {Function} fallbackOperation - Fallback function if Prisma fails
 * @param {string} operationName - Name for logging (e.g., 'fetch reports')
 * @returns {Promise} Result from either Prisma or fallback
 */
async function withDatabaseFallback(dbOperation, fallbackOperation, operationName = 'database operation') {
  try {
    console.log(`🔄 [DB] ${operationName}...`);
    const result = await dbOperation();
    console.log(`✅ [DB] ${operationName} succeeded`);
    return result;
  } catch (error) {
    console.error(`❌ [DB] ${operationName} failed:`, error.message || error);
    console.log(`⚠️ [DB] Falling back to JSON file storage...`);
    try {
      const result = fallbackOperation();
      console.log(`✅ [DB] Fallback ${operationName} succeeded`);
      return result;
    } catch (fallbackError) {
      console.error(`❌ [Fallback] ${operationName} failed:`, fallbackError.message || fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Update a report and emit real-time notification
 * @param {Object} prisma - Prisma client
 * @param {number} reportId - Report ID to update
 * @param {Object} updateData - Data to update
 * @param {Function} logActivityFn - Function to log activity
 * @param {Object} io - Socket.IO instance
 * @param {Object} existingData - Original data for comparison
 * @returns {Promise<Object>} Updated report
 */
async function updateReportWithNotification(
  prisma,
  reportId,
  updateData,
  logActivityFn,
  io,
  existingData = {}
) {
  const updated = await prisma.bugReport.update({
    where: { id: reportId },
    data: updateData
  });

  // Emit real-time update
  if (io) {
    io.emit('report-updated', updated);
  }

  return updated;
}

/**
 * Update report via fallback JSON storage
 * @param {number} reportId - Report ID
 * @param {Object} updateData - Data to update
 * @param {Object} io - Socket.IO instance
 * @returns {Object} Updated report
 */
function updateReportFallback(reportId, updateData, io) {
  const reports = readFallbackReports();
  const idx = reports.findIndex(r => r.id === reportId);

  if (idx === -1) {
    throw new Error(`Report ${reportId} not found in fallback storage`);
  }

  // Apply updates
  Object.assign(reports[idx], updateData, {
    updatedAt: new Date().toISOString()
  });

  saveFallbackReports(reports);

  if (io) {
    io.emit('report-updated', reports[idx]);
  }

  return reports[idx];
}

/**
 * Get all reports from database with fallback
 * @param {Object} prisma - Prisma client
 * @returns {Promise<Array>} Sorted reports
 */
async function getAllReports(prisma) {
  return withDatabaseFallback(
    () => prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } }),
    () => readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    'Fetching all reports'
  );
}

/**
 * Get a single report by ID
 * @param {Object} prisma - Prisma client
 * @param {number} reportId - Report ID
 * @returns {Promise<Object>} Report object
 */
async function getReportById(prisma, reportId) {
  const prismaOp = () => prisma.bugReport.findUnique({ where: { id: reportId } });
  const fallbackOp = () => readFallbackReports().find(r => r.id === reportId);

  return withDatabaseFallback(prismaOp, fallbackOp, `Fetching report ${reportId}`);
}

/**
 * Get comments for a report
 * @param {Object} prisma - Prisma client
 * @param {number} reportId - Report ID
 * @returns {Promise<Array>} Comments array
 */
async function getReportComments(prisma, reportId) {
  const prismaOp = () =>
    prisma.comment.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' }
    });

  const fallbackOp = () => {
    const comments = readFallbackComments();
    return (comments[String(reportId)] || []).sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
  };

  return withDatabaseFallback(prismaOp, fallbackOp, `Fetching comments for report ${reportId}`);
}

/**
 * Get activity logs for a report
 * @param {Object} prisma - Prisma client
 * @param {number} reportId - Report ID
 * @param {number} limit - Maximum number of logs to fetch
 * @returns {Promise<Array>} Activity logs
 */
async function getReportActivity(prisma, reportId, limit = 25) {
  const prismaOp = () =>
    prisma.activityLog.findMany({
      where: {
        reportId,
        action: { not: 'Comment added' }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

  const fallbackOp = () => []; // File storage doesn't track activities

  return withDatabaseFallback(prismaOp, fallbackOp, `Fetching activity for report ${reportId}`);
}

module.exports = {
  withDatabaseFallback,
  updateReportWithNotification,
  updateReportFallback,
  getAllReports,
  getReportById,
  getReportComments,
  getReportActivity
};
