// Test S3 URLs from your Target store images
const testImages = [
  'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%231450+-+1727+Martin+Luther+King+Jr+Blvd%2C+Houma%2C+LA+70360/11-11-2025/IMG_3116.jpg',
  'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0698.jpg',
  'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0699.jpg',
  'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0700.jpg',
  'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0701.jpg'
];

async function createTestProject() {
  console.log('Creating test project...');
  
  const response = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Batch Detection Test',
      description: 'Testing parallel batch detection performance'
    })
  });
  
  const project = await response.json();
  console.log(`✅ Project created: ${project.id}\n`);
  return project.id;
}

async function uploadImage(imageUrl, projectId) {
  const response = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      projectId
    })
  });
  
  return await response.json();
}

(async () => {
  try {
    const projectId = await createTestProject();
    
    console.log(`Uploading ${testImages.length} test images...\n`);
    
    for (let i = 0; i < testImages.length; i++) {
      console.log(`  [${i+1}/${testImages.length}] Uploading...`);
      const result = await uploadImage(testImages[i], projectId);
      
      if (result.error) {
        console.log(`    ❌ Failed: ${result.error}`);
      } else {
        console.log(`    ✅ Uploaded: ${result.image.id}`);
      }
    }
    
    console.log(`\n✅ All images uploaded!`);
    console.log(`\nProject ID: ${projectId}`);
    console.log(`\nNow run batch detection test with:`);
    console.log(`  Concurrency 1: Sequential`);
    console.log(`  Concurrency 3: Parallel (3x)`);
    console.log(`  Concurrency 5: Aggressive (5x)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();
