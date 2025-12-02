import { initializeImageUploader } from '../multi-image-uploader.js';
import { showConfirmModal } from "../modal.js";
import { callApi } from "../api/api.js";

document.addEventListener('DOMContentLoaded', async () => {

    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    const editPostForm = document.getElementById('edit-post-form');
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const editPostButton = document.getElementById('edit-post-button');
    const errorMessageDiv = document.getElementById('form-error-message');

    // 1. 기존 데이터 로드 (API 로직은 동일)
    const postDetail = await getPostDetail(postId);
    const beforeTitle = postDetail.payload.title;
    const beforeContent = postDetail.payload.content;
    titleInput.value = beforeTitle;
    contentInput.value = beforeContent;

    const postImages = postDetail.payload.postImages;
    postImages.sort((a, b) => a.sequence - b.sequence);

    // 2. Uploader 초기화 (기존 이미지 주입 & 콜백 설정)
    const uploader = initializeImageUploader({
        inputId: 'imageInput',
        containerId: 'imagePreviewContainer',
        addButtonSelector: 'label[for="imageInput"]',
        maxFiles: 5,
        onUploadStatusChange: (isUploading) => {
            editPostButton.disabled = isUploading;
            if (isUploading) {
                editPostButton.textContent = '이미지 업로드 중...';
            } else {
                editPostButton.innerHTML = '게시글 수정';
            }
        }
    }, postImages);

    // 3. 수정 버튼 핸들러
    editPostForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // 현재 리스트 가져오기 (신규 이미지는 이미 업로드 되어 ID가 있음)
        const currentImages = uploader.getFinalImageList();

        if (uploader.isUploading() || currentImages.some(img => img.uploading)) {
            await showConfirmModal('업로드 대기', '이미지 업로드가 진행 중입니다.');
            return;
        }

        editPostButton.disabled = true;
        editPostButton.innerHTML = `
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <span role="status">수정 중...</span>
        `;

        try {
            // 기존 이미지든 새 이미지든 uploader가 imageId를 가지고 있음.
            const finalPostImages = currentImages.map(img => ({
                imageId: img.imageId,
                sequence: img.sequence
            }));

            // API 호출 (PATCH)
            const editPostResponse = await callApi(`/posts/${postId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: titleInput.value !== beforeTitle ? titleInput.value : null,
                    content: contentInput.value !== beforeContent ? contentInput.value : null,
                    images: finalPostImages // 단순히 ID 목록만 전송
                }),
                credentials: 'include'
            });

            const data = await editPostResponse.json();
            if (data.isSuccess) {
                await showConfirmModal('게시글 수정완료', '게시글이 성공적으로 수정되었습니다.');
                window.location.replace(`/pages/post-detail.html?id=${postId}`);
            } else {
                throw new Error(await editPostResponse.text() || '게시글 수정 실패');
            }
        } catch (error) {
            errorMessageDiv.textContent = error.message;
            errorMessageDiv.classList.remove('d-none');
            editPostButton.disabled = false;
            editPostButton.innerHTML = '게시글 수정';
        }
    });
});

async function getPostDetail(postId) {
    // ... (기존과 동일)
    try {
        const response = await callApi(`/posts/${postId}?isEdit=true`, { credentials: 'include' });
        const data = await response.json();
        if (data.isSuccess) return data;
        else await showConfirmModal('오류', '데이터 로드 실패');
    } catch (e) {
        window.location.href = '/pages/posts.html';
    }
}