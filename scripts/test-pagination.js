/**
 * Mocking verification for the newsletter worker's pagination logic.
 * This script simulates the do-while loop in api/newsletter-worker.js
 */

async function mockFetchSubscribers(token = '') {
    // Mock 3 pages of subscribers
    const pages = {
        '': {
            documents: [{ fields: { email: { stringValue: 'user1@example.com' } } }, { fields: { email: { stringValue: 'user2@example.com' } } }],
            nextPageToken: 'page2'
        },
        'page2': {
            documents: [{ fields: { email: { stringValue: 'user3@example.com' } } }],
            nextPageToken: 'page3'
        },
        'page3': {
            documents: [{ fields: { email: { stringValue: 'user4@example.com' } } }]
            // no nextPageToken
        }
    };
    return pages[token] || { documents: [] };
}

async function verifyPagination() {
    console.log("Starting Pagination Mock Test...");
    let emails = [];
    let pageToken = '';
    let iterations = 0;

    do {
        iterations++;
        console.log(`Fetching Page ${iterations} (token: "${pageToken}")...`);
        const data = await mockFetchSubscribers(pageToken);
        
        if (data.documents) {
            const batchEmails = data.documents.map(doc => doc.fields?.email?.stringValue).filter(Boolean);
            emails = emails.concat(batchEmails);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    console.log(`Success: Found ${emails.length} total subscribers over ${iterations} iterations.`);
    if (emails.length === 4 && iterations === 3) {
        console.log("✅ Pagination logic verified!");
    } else {
        console.error("❌ Pagination logic error!");
        process.exit(1);
    }
}

verifyPagination();
