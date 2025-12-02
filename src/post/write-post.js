import { initializeImageUploader } from '../multi-image-uploader.js';
import { showConfirmModal } from "../modal.js";
import { callApi } from "../api/api.js";

document.addEventListener('DOMContentLoaded', () => {

    const writePostForm = document.getElementById('write-post-form');
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const writePostButton = document.getElementById('write-post-button');
    const errorMessageDiv = document.getElementById('form-error-message');
    const previewContainer = document.getElementById('imagePreviewContainer');

    // 1. Uploader 초기화 및 콜백 설정
    const uploader = initializeImageUploader({
        inputId: 'imageInput',
        containerId: 'imagePreviewContainer',
        addButtonSelector: 'label[for="imageInput"]',
        maxFiles: 5,
        onUploadStatusChange: (isUploading) => {
            // 업로드 중이면 버튼 비활성화, 완료되면 활성화
            writePostButton.disabled = isUploading;
            if (isUploading) {
                writePostButton.textContent = '이미지 업로드 중...';
            } else {
                writePostButton.innerHTML = '나의 이야기, 이음🧶'; // 원래 텍스트 복구
            }
        }
    }, []);

    // 2. '게시글 작성' 버튼 리스너
    writePostForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // 1. 업로더에서 현재 리스트 가져오기
        const currentImages = uploader.getFinalImageList();

        // 2. 아직 업로드 중인 이미지가 있는지 체크
        if (uploader.isUploading() || currentImages.some(img => img.uploading)) {
            await showConfirmModal('업로드 대기', '이미지 업로드가 진행 중입니다. 잠시만 기다려주세요.');
            return;
        }

        // 3. 버튼 잠금 및 스피너
        writePostButton.disabled = true;
        writePostButton.innerHTML = `
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <span role="status">등록 중...</span>
        `;

        try {
            const finalPostImages = currentImages.map(img => ({
                imageId: img.imageId,
                sequence: img.sequence
            }));

            // 4. 게시글 생성 API 호출
            const createPostResponse = await callApi(`/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: titleInput.value,
                    content: contentInput.value,
                    postImages: finalPostImages
                }),
                credentials: 'include'
            });

            const data = await createPostResponse.json();

            if (data.isSuccess) {
                await showConfirmModal('게시글 작성완료', '게시글이 성공적으로 등록되었습니다.');
                window.location.replace(`/pages/post-detail.html?id=${data.payload.postId}`);
            } else {
                throw new Error(data.errorMessage || '게시글 등록 실패');
            }

        } catch (error) {
            errorMessageDiv.textContent = error.message;
            errorMessageDiv.classList.remove('d-none');
            writePostButton.disabled = false;
            writePostButton.innerHTML = '나의 이야기, 이음🧶';
        }
    });
});